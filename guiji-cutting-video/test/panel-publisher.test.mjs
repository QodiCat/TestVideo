import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,cpSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../scripts/publisher-core.mjs';
import {publishImmediately,runBrowserSchedule,immediateCandidate} from '../scripts/panel-publisher.mjs';
import {createPanel} from '../scripts/panel.mjs';
import {BrowserInstagram} from '../scripts/browser-publisher.mjs';
import {loadDependencies,findBrowser} from '../scripts/render.mjs';
import {fileURLToPath} from 'node:url';

const now=()=>Date.parse('2030-01-01T12:00:00Z');
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'guiji-immediate-test-'));
  const config=JSON.parse(readFileSync(new URL('../publisher.example.json',import.meta.url),'utf8'));
  config.automation={enabled:false};config.schedule={...config.schedule,times:['23:00'],utcOffset:'+00:00',daysAhead:1,renderAheadHours:1};
  writeFileSync(join(root,'publisher.json'),JSON.stringify(config));const store=new Store(root);
  let sequence=0;
  const add=(id,status='queued',extra={})=>{const j={id,status,scheduled:new Date(now()+86400000+sequence++*1000).toISOString(),video:{object:'kiwi',cuts:[10]},caption:'test',attempts:0,shareToFeed:true,isAiGenerated:false,...extra};store.save(j);return j;};
  const counts={created:0,connections:0,closes:0,shares:0,renders:[],manual:[]};
  const browser={isConnected:false,paused:false,page:{goto:async()=>{}},async open(){if(!this.isConnected){counts.connections++;this.isConnected=true;}},async verifyAccount(){await this.open();return 'your_username';},resume(){this.paused=false;},pause(){this.paused=true;},async close(){counts.closes++;this.isConnected=false;},async prepare(){await this.verifyAccount();return 'preview.png';},async share({manual}={}){counts.shares++;counts.manual.push(manual);return {confirmed:true};},async screenshot(){return 'error.png';}};
  const renderJob=async(job,st)=>{counts.renders.push(job.id);job.file=join(root,job.id+'.mp4');job.status='ready';st.save(job);};
  const options={root,renderJob,verifyVideo:async()=>{},now};
  return {root,config,store,add,counts,browser,options,close(){store.close();rmSync(root,{recursive:true,force:true});}};
}

test('queued future job publishes immediately with automation off, then never repeats at its scheduled time',async()=>{
  const f=fixture();try{
    const initial=f.add('early');f.add('other','queued',{scheduled:new Date(now()+2*86400000).toISOString()});
    const {job}=await publishImmediately('early',f.store,f.browser,f.options);
    assert.equal(job.status,'published');assert.equal(job.scheduled,initial.scheduled);assert.ok(job.publishedEarlyAt);
    assert.deepEqual(f.counts.renders,['early']);assert.deepEqual(f.counts.manual,[true]);assert.equal(f.store.get('other').status,'queued');
    assert.equal((await publishImmediately('early',f.store,f.browser,f.options)).alreadyPublished,true);assert.equal(f.counts.shares,1);
    f.config.automation.enabled=true;writeFileSync(join(f.root,'publisher.json'),JSON.stringify(f.config));
    await runBrowserSchedule(f.config,f.store,f.browser,{...f.options,now:()=>Date.parse(initial.scheduled)+1000});
    assert.equal(f.counts.shares,1);assert.equal(f.counts.connections,1);
  }finally{f.close();}
});

test('ready task skips rendering; cancelled, API and uncertain jobs cannot be immediately replayed',async()=>{
  const f=fixture();try{
    f.add('ready','ready',{file:'fixture.mp4'});await publishImmediately('ready',f.store,f.browser,f.options);assert.deepEqual(f.counts.renders,[]);
    for(const [id,status,extra] of [['cancel','cancelled',{}],['uncertain','gui_uncertain',{}],['api','ready',{containerId:'123'}],['crash','ready',{manualPublishRequestedAt:'previous-process'}]]){
      const j=f.add(id,status,extra);assert.equal(immediateCandidate(j),false);await assert.rejects(()=>publishImmediately(id,f.store,f.browser,f.options));
    }
    assert.equal(f.counts.shares,1);
  }finally{f.close();}
});

test('share timeout after click stays uncertain and refuses repeated immediate requests',async()=>{
  const f=fixture();try{
    f.add('lost','ready',{file:'fixture.mp4'});f.browser.share=async()=>{f.counts.shares++;throw Error('private upstream error');};
    await assert.rejects(()=>publishImmediately('lost',f.store,f.browser,f.options));assert.equal(f.store.get('lost').status,'gui_uncertain');
    await assert.rejects(()=>publishImmediately('lost',f.store,f.browser,f.options));assert.equal(f.counts.shares,1);assert.equal(f.browser.paused,true);
    assert.ok(!f.store.get('lost').error.includes('private upstream'));
  }finally{f.close();}
});

test('schedule reuses one authorized browser over multiple ticks and protects interrupted manual jobs',async()=>{
  const f=fixture();try{
    f.config.automation.enabled=true;writeFileSync(join(f.root,'publisher.json'),JSON.stringify(f.config));
    f.add('first','ready',{scheduled:new Date(now()-1000).toISOString(),file:'first.mp4'});
    await runBrowserSchedule(f.config,f.store,f.browser,f.options);
    f.add('second','ready',{scheduled:new Date(now()-500).toISOString(),file:'second.mp4'});
    f.add('crashed','ready',{scheduled:new Date(now()-250).toISOString(),manualPublishRequestedAt:'previous-process'});
    await runBrowserSchedule(f.config,f.store,f.browser,f.options);
    assert.equal(f.counts.shares,2);assert.equal(f.counts.connections,1);assert.equal(f.counts.closes,0);assert.deepEqual(f.counts.manual,[false,false]);
    assert.equal(f.store.get('crashed').status,'needs_review');
  }finally{f.close();}
});

test('explicit manual share works while automatic sharing remains disabled',async()=>{
  const f=fixture();try{
    const browser=new BrowserInstagram(f.config,f.root);let clicks=0;
    browser.guard=async()=>{};browser.shareButton={click:async()=>{clicks++;}};browser.page={getByText:()=>({first:()=>({waitFor:async()=>{}})})};
    await assert.rejects(()=>browser.share(),e=>e.code==='AUTOMATION_DISABLED');assert.equal(clicks,0);
    assert.equal((await browser.share({manual:true})).confirmed,true);assert.equal(clicks,1);
  }finally{f.close();}
});

test('panel keeps login connection through verify, doctor and two manual publications, then explicitly disconnects',async()=>{
  const f=fixture();let app;
  try{
    f.add('one');f.add('two','queued',{scheduled:new Date(now()+2*86400000).toISOString()});
    app=createPanel({root:f.root,autoTick:false,browserFactory:()=>{f.counts.created++;return f.browser;},renderJob:f.options.renderJob,verifyVideo:f.options.verifyVideo});
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
    const html=await(await fetch(origin)).text(),token=html.match(/name="panel-token" content="([^"]+)"/)[1];
    const post=(path,body={})=>fetch(origin+'/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Panel-Token':token},body:JSON.stringify(body)});
    const idle=async()=>{for(let i=0;i<200&&app.snapshot().operation;i++)await new Promise(r=>setTimeout(r,5));assert.equal(app.snapshot().operation,null);};
    assert.equal((await post('login/open')).status,200);assert.equal((await post('login/verify')).status,200);
    assert.equal(app.snapshot().browserConnected,true);assert.equal(app.snapshot().loginOpen,false);assert.equal(f.counts.closes,0);
    assert.equal((await post('action',{command:'doctor',live:true})).status,202);await idle();
    for(const id of ['one','two']){assert.equal((await post('publish-now',{id})).status,202);await idle();assert.equal(f.store.get(id).status,'published');}
    assert.equal((await post('publish-now',{id:'one'})).status,200);assert.equal(f.counts.shares,2);
    assert.equal(f.counts.created,1);assert.equal(f.counts.connections,1);assert.equal(f.counts.closes,0);
    assert.equal((await post('login/close')).status,200);assert.equal(app.snapshot().browserConnected,false);assert.equal(f.counts.closes,1);
  }finally{await app?.close();f.close();}
});

test('concurrent immediate requests cannot publish the same job twice',async()=>{
  const f=fixture();let app,finishRender;
  try{
    f.add('one');const barrier=new Promise(r=>finishRender=r);
    app=createPanel({root:f.root,autoTick:false,browserFactory:()=>f.browser,renderJob:async(...args)=>{await barrier;return f.options.renderJob(...args);},verifyVideo:f.options.verifyVideo});
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
    const html=await(await fetch(origin)).text(),token=html.match(/name="panel-token" content="([^"]+)"/)[1];
    const post=()=>fetch(origin+'/api/publish-now',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Panel-Token':token},body:'{"id":"one"}'});
    assert.equal((await post()).status,202);assert.equal((await post()).status,400);finishRender();
    for(let i=0;i<200&&app.snapshot().operation;i++)await new Promise(r=>setTimeout(r,5));
    assert.equal(f.counts.shares,1);assert.equal(f.store.get('one').status,'published');
  }finally{finishRender?.();await app?.close();f.close();}
});

test('real browser UI publishes one queued row early and exposes the retained connection',async()=>{
  const f=fixture();let app,browser;
  try{
    f.add('first');f.add('second');
    app=createPanel({root:f.root,autoTick:false,browserFactory:()=>f.browser,renderJob:f.options.renderJob,verifyVideo:f.options.verifyVideo});
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
    const {chromium}=loadDependencies();browser=await chromium.launch({executablePath:findBrowser(),headless:true});
    const page=await browser.newPage({viewport:{width:1480,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.locator('[data-publish-now="first"]').waitFor();await page.locator('[data-publish-now="first"]').click();
    await page.waitForFunction(()=>document.querySelector('#queue-body').textContent.includes('已提前发布，原计划不会重复发布'));
    assert.equal(f.store.get('first').status,'published');assert.equal(f.store.get('second').status,'queued');assert.equal(f.counts.shares,1);
    assert.equal(await page.locator('[data-publish-now="first"]').count(),0);assert.equal(await page.locator('[data-publish-now="second"]').count(),1);
    assert.match(await page.locator('#engine-message').innerText(),/连接保持中/);assert.equal(await page.locator('#close-login').isVisible(),true);assert.equal(await page.locator('#login').isVisible(),false);
    await page.locator('.queue-card').screenshot({path:fileURLToPath(new URL('../output/panel-verification/publish-now.png',import.meta.url))});
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await app?.close();f.close();}
});

test('immediate queued task really renders and validates H264/AAC before the simulated share',async()=>{
  const f=fixture();try{
    cpSync(new URL('../scripts/',import.meta.url),join(f.root,'scripts'),{recursive:true});
    f.add('real-render','queued',{video:{object:'soap',cuts:[3],seconds:[3],width:360,fps:24,seed:1511}});
    const {job}=await publishImmediately('real-render',f.store,f.browser,{root:f.root});
    assert.equal(job.status,'published');assert.ok(existsSync(job.file));assert.equal(f.counts.shares,1);
  }finally{f.close();}
});
