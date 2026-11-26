import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store,validateConfig} from '../scripts/publisher-core.mjs';
import {objectIds} from '../scripts/catalog.mjs';
import {createPanel} from '../scripts/panel.mjs';
import {BrowserInstagram,submitBrowserJob} from '../scripts/browser-publisher.mjs';
import {loadDependencies,findBrowser} from '../scripts/render.mjs';

const fixture=t=>{
  const root=mkdtempSync(join(tmpdir(),'guiji-panel-test-'));
  const config=JSON.parse(readFileSync(new URL('../publisher.example.json',import.meta.url),'utf8'));
  writeFileSync(join(root,'publisher.json'),JSON.stringify(config));
  t.after(()=>rmSync(root,{recursive:true,force:true}));return {root,config};
};
async function serve(t,options){
  const app=createPanel({...options,autoTick:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  t.after(()=>app.close());const origin='http://127.0.0.1:'+app.server.address().port;
  const html=await(await fetch(origin)).text();const token=html.match(/name="panel-token" content="([^"]+)"/)[1];
  const post=(path,body)=>fetch(origin+'/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Panel-Token':token},body:JSON.stringify(body)});
  return {app,origin,post};
}

test('100-item cycle is persisted, wraps in order, and restart does not repeat scheduled jobs',t=>{
  const {root,config:c}=fixture(t);c.video.strategy='cycle_all';c.schedule={...c.schedule,daysAhead:30,times:['01:00','06:00','12:00','18:00'],utcOffset:'+00:00'};
  let s=new Store(root);assert.equal(s.plan(c,new Date('2026-11-01T00:00:00Z')),120);
  const jobs=s.all();assert.deepEqual(jobs.slice(0,100).map(j=>j.video.object),objectIds);assert.deepEqual(jobs.slice(100).map(j=>j.video.object),objectIds.slice(0,20));s.close();
  s=new Store(root);try{assert.equal(s.plan(c,new Date('2026-11-01T00:00:00Z')),0);assert.equal(s.plan(c,new Date('2026-11-02T00:00:00Z')),4);assert.deepEqual(s.all().slice(-4).map(j=>j.video.object),objectIds.slice(20,24));}finally{s.close();}
});

test('selected cycle and invalid strategy/template validation',t=>{
  const {root,config:c}=fixture(t);c.video.strategy='cycle_selected';c.video.objects=['soap','kiwi'];
  const s=new Store(root);try{s.plan(c,new Date('2026-11-20T01:00:00Z'));assert.deepEqual(s.all().slice(0,5).map(j=>j.video.object),['soap','kiwi','soap','kiwi','soap']);}finally{s.close();}
  c.video.strategy='other';assert.throws(()=>validateConfig(c),/策略/);c.video.strategy='cycle_all';c.caption='{object}'.repeat(240);assert.throws(()=>validateConfig(c),/2200/);
});

test('panel protects local mutations, persists settings and replaces only safe future generated tasks',async t=>{
  const {root}=fixture(t);const s=new Store(root);
  const make=(id,days,status,extra={})=>({id,scheduled:new Date(Date.now()+days*86400000).toISOString(),status,attempts:0,video:{object:'soap',cuts:[10]},...extra});
  s.save(make('future-generated',1,'ready'));s.save(make('history',-1,'published'));
  s.save(make('started',2,'processing',{containerId:'123'}));s.save(make('manual',3,'ready',{video:undefined}));s.save(make('uncertain',4,'gui_uncertain',{browserShareStartedAt:new Date().toISOString()}));s.close();
  const {app,origin,post}=await serve(t,{root,runCommand:async()=>({code:0,output:'mock'})});
  assert.equal(app.snapshot().settings.enabled,false);
  assert.equal((await fetch(origin+'/api/automation',{method:'POST',body:'{"enabled":true}'})).status,403);
  const snapshot=app.snapshot();const settings={...snapshot.settings,strategy:'cycle_all',times:['09:00','18:00']};
  const response=await post('settings',{revision:snapshot.revision,settings});assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).removed,1);
  const updated=app.snapshot();assert.equal(updated.settings.times.length,2);assert.equal(updated.settings.objects.length,100);assert.equal(updated.settings.strategy,'cycle_all');
  const check=new Store(root);try{assert.equal(check.get('future-generated'),undefined);for(const id of ['history','started','manual','uncertain'])assert.ok(check.get(id));}finally{check.close();}
  assert.equal((await post('settings',{revision:snapshot.revision,settings})).status,400,'stale editor must not overwrite newer settings');
  const previous=readFileSync(join(root,'publisher.json'),'utf8');const latest=app.snapshot();settings.times=['09:00','09:00'];
  assert.equal((await post('settings',{revision:latest.revision,settings})).status,400);assert.equal(readFileSync(join(root,'publisher.json'),'utf8'),previous);
  assert.equal((await post('job',{id:'started',action:'cancel'})).status,400);
});

test('automation switch starts supervisor once, persists off and blocks later ticks',async t=>{
  const {root}=fixture(t);const calls=[];
  const {app,post}=await serve(t,{root,runCommand:async(command,args)=>{calls.push([command,args]);return {code:0,output:'done'};}});
  assert.equal((await post('automation',{enabled:true})).status,200);
  await new Promise(r=>setTimeout(r,20));assert.deepEqual(calls,[['run',['--live','--once']]]);
  await app.tick();assert.equal(calls.length,1);
  assert.equal((await post('automation',{enabled:false})).status,200);await app.tick();assert.equal(calls.length,1);
  assert.equal(JSON.parse(readFileSync(join(root,'publisher.json'),'utf8')).automation.enabled,false);
});

test('future plan rebuild rewinds only unconsumed tail and gives regenerated videos fresh file IDs',t=>{
  const {root,config:c}=fixture(t);c.video.strategy='cycle_selected';c.video.objects=['kiwi','soap'];
  const s=new Store(root);try{
    const now=new Date('2030-01-01T00:00:00Z');s.plan(c,now);const original=s.all();const first=original[0];first.status='published';s.save(first);
    assert.equal(s.replaceFuture(now),6);c.planRevision='new-plan';s.plan(c,now);
    const rebuilt=s.all();assert.equal(rebuilt[0].id,first.id);assert.equal(rebuilt[1].video.object,'soap');assert.notEqual(rebuilt[1].id,original[1].id);assert.equal(rebuilt[1].cycleSequence,1);
  }finally{s.close();}
});

test('switching off after preparation but before share restores ready without a click or false uncertainty',async t=>{
  const {root}=fixture(t);const s=new Store(root);
  try {
  const c=JSON.parse(readFileSync(join(root,'publisher.json'),'utf8'));c.automation={enabled:false};writeFileSync(join(root,'publisher.json'),JSON.stringify(c));
  const browser=new BrowserInstagram(c,root);let clicked=false;
  browser.prepare=async()=>{};browser.shareButton={click:()=>{clicked=true;}};
  const job={id:'disabled',scheduled:new Date().toISOString(),status:'ready'};s.save(job);
  await submitBrowserJob(job,s,browser);assert.equal(clicked,false);assert.equal(s.get(job.id).status,'ready');assert.equal(s.get(job.id).browserShareStartedAt,undefined);assert.equal(browser.paused,false);
  }finally{s.close();}
});

test('real browser panel: edit frequency, all-object strategy, save, toggle, reload, search and mobile layout',async t=>{
  const {root}=fixture(t);const calls=[];
  const {app,origin}=await serve(t,{root,runCommand:async(command,args)=>{calls.push([command,args]);return {code:0,output:'测试环境：任务已完成'};}});
  const {chromium}=loadDependencies();const browser=await chromium.launch({executablePath:findBrowser(),headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1480,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.locator('#stat-frequency').filter({hasText:'1'}).waitFor();
    await page.locator('label.strategy-option').filter({hasText:'全部 100 种循环'}).click();
    await page.selectOption('#frequency','3');
    for(const [i,time] of ['09:00','15:00','21:00'].entries())await page.locator('#time-slots input').nth(i).fill(time);
    await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#stat-frequency').textContent==='3');
    assert.equal(app.snapshot().settings.strategy,'cycle_all');assert.equal(app.snapshot().settings.objects.length,100);
    assert.deepEqual(app.snapshot().settings.times,['09:00','15:00','21:00']);
    await page.locator('#automation-toggle').click();await page.waitForFunction(()=>document.querySelector('#automation-toggle').getAttribute('aria-checked')==='true');
    assert.equal(app.snapshot().settings.enabled,true);assert.equal(calls.length,1);
    await page.reload();await page.waitForFunction(()=>document.querySelector('#automation-toggle').getAttribute('aria-checked')==='true');
    await page.locator('#automation-toggle').click();await page.waitForFunction(()=>document.querySelector('#automation-toggle').getAttribute('aria-checked')==='false');
    const out=new URL('../output/panel-verification/',import.meta.url);mkdirSync(out,{recursive:true});
    await page.screenshot({path:fileURLToPath(new URL('desktop.png',out)),fullPage:true});
    await page.locator('#search').fill('牛油果');assert.equal(await page.locator('.object-card').count(),1);assert.match(await page.locator('.object-card').innerText(),/牛油果/);
    await page.locator('#search').fill('');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.screenshot({path:fileURLToPath(new URL('mobile.png',out)),fullPage:true});assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
