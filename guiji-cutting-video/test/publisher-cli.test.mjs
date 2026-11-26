import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Store } from '../scripts/publisher-core.mjs';

const project=fileURLToPath(new URL('../',import.meta.url));

test('isolated CLI: plan → render → probe → restart, expiry, retry and uncertain-share protection', {timeout:90000}, t=>{
  const root=mkdtempSync(join(tmpdir(),'guiji-cli-test-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  cpSync(join(project,'scripts'),join(root,'scripts'),{recursive:true});
  const config=JSON.parse(readFileSync(join(project,'publisher.example.json'),'utf8'));
  // A single slot today, several minutes in the future. Use UTC to avoid host timezone dependence.
  const slot=new Date(Date.now()+5*60000);
  const crossesMidnight=slot.toISOString().slice(0,10)!==new Date().toISOString().slice(0,10);
  config.schedule={...config.schedule,times:[slot.toISOString().slice(11,16)],utcOffset:'+00:00',daysAhead:crossesMidnight?2:1};
  config.video={objects:['rainbow_cake'],cuts:[3,10],seconds:[2,2],width:360,fps:24};
  writeFileSync(join(root,'publisher.json'),JSON.stringify(config));
  const env={...process.env,GUIJI_CUTTING_DEPS:process.env.GUIJI_CUTTING_DEPS ?? resolve(project,'../.render-deps')};
  const cli=(...args)=>{
    const result=spawnSync(process.execPath,[join(root,'scripts/publish.mjs'),...args],{cwd:root,env,encoding:'utf8',timeout:45000,windowsHide:true});
    assert.ifError(result.error);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
    return result.stdout;
  };
  const jobs=()=>{const store=new Store(root);try{return store.all();}finally{store.close();}};
  cli('plan');assert.equal(jobs().length,1);assert.equal(jobs()[0].status,'queued');
  cli('plan');assert.equal(jobs().length,1);
  const prepared=cli('prepare');assert.match(prepared,/video_ready/);
  const first=jobs()[0];assert.equal(first.status,'ready');assert.ok(existsSync(first.file));
  const media=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',first.file],{encoding:'utf8',windowsHide:true});
  assert.equal(media.status,0,media.stderr);
  const probe=JSON.parse(media.stdout);
  assert.ok(probe.streams.some(s=>s.codec_name==='h264' && s.width===360 && s.height===640));
  assert.ok(probe.streams.some(s=>s.codec_name==='aac'));assert.ok(Number(probe.format.duration)>=4);
  cli('run','--once');assert.deepEqual(jobs(),[first]);

  const store=new Store(root);
  const job=(id,status,scheduled)=>({id,status,scheduled,attempts:0,video:{object:'soap',cuts:[3],seconds:[3],width:360,fps:24},caption:'isolated test',shareToFeed:true,isAiGenerated:false});
  const overdue=new Date(Date.now()-12*3600000).toISOString(), due=new Date(Date.now()-60000).toISOString();
  store.save(job('test-expired','queued',overdue));
  store.save(job('test-gui-uncertain','gui_uncertain',new Date(Date.now()-120000).toISOString()));
  store.save(job('test-cancelled','cancelled',new Date(Date.now()-180000).toISOString()));
  store.save(job('test-bad-media','queued',due));
  store.close();
  mkdirSync(join(root,'output'),{recursive:true});
  writeFileSync(join(root,'output/test-bad-media.mp4'),'invalid video');
  cli('run','--once');
  const states=Object.fromEntries(jobs().map(j=>[j.id,j]));
  assert.equal(states['test-expired'].status,'skipped');
  assert.equal(states['test-gui-uncertain'].status,'needs_review');
  assert.equal(states['test-cancelled'].status,'cancelled');
  assert.equal(states['test-bad-media'].status,'queued');
  assert.equal(states['test-bad-media'].attempts,1);assert.ok(Date.parse(states['test-bad-media'].retryAt)>Date.now());
  assert.ok(jobs().every(j=>j.status!=='published'));
  cli('run','--once');
  assert.equal(jobs().find(j=>j.id==='test-bad-media').attempts,1,'backoff must prevent immediate retry');
  assert.equal(existsSync(join(root,'data/worker.lock')),false);
});
