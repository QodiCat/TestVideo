import {createServer} from 'node:http';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Store,validateConfig,acquireLock,loadEnv} from './publisher-core.mjs';
import {catalog,objectIds} from './catalog.mjs';
import {BrowserInstagram,retryBrowserJob} from './browser-publisher.mjs';
import {publishImmediately,runBrowserSchedule,immediateCandidate} from './panel-publisher.mjs';

const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const readJSON=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
function atomicJSON(root,path,value){mkdirSync(join(root,'data'),{recursive:true});const temp=join(root,'data','config-'+randomUUID()+'.tmp');writeFileSync(temp,JSON.stringify(value,null,2)+'\n');renameSync(temp,path);}

export function createPanel({root=sourceRoot,runCommand,autoTick=true,browserFactory=(c,r)=>new BrowserInstagram(c,r),renderJob,verifyVideo}={}) {
  root=resolve(root);loadEnv(join(root,'.env'));
  const configPath=join(root,'publisher.json');
  if(!existsSync(configPath))writeFileSync(configPath,readFileSync(join(sourceRoot,'publisher.example.json')));
  const initial=readJSON(configPath);
  if(!initial.automation){initial.automation={enabled:false};atomicJSON(root,configPath,initial);}
  const token=randomBytes(24).toString('hex');
  let operation=null,lastResult=null,login=null,loginRelease=null,stopping=false,lastTick=0,publisher=null,publisherKey=null;
  const runtimePath=join(root,'data/panel-runtime.json');
  if(existsSync(runtimePath))try{lastResult=readJSON(runtimePath);}catch{}
  const config=()=>validateConfig(readJSON(configPath));
  const withStore=fn=>{const store=new Store(root);try{return fn(store);}finally{store.close();}};
  const view=c=>({username:c.browser?.expectedUsername ?? '',enabled:c.automation?.enabled===true,
    connectionMode:c.browser?.connectionMode ?? 'dedicated',cdpEndpoint:c.browser?.cdpEndpoint ?? 'auto',
    times:[...c.schedule.times].sort(),utcOffset:c.schedule.utcOffset,daysAhead:c.schedule.daysAhead,
    renderAheadHours:c.schedule.renderAheadHours,lateGraceMinutes:c.schedule.lateGraceMinutes,
    strategy:c.video.strategy ?? 'random',objects:c.video.strategy==='cycle_all'?[...objectIds]:c.video.objects,
    cuts:c.video.cuts,seconds:c.video.seconds,width:c.video.width,fps:c.video.fps,caption:c.caption});
  const revision=()=>hash(readFileSync(configPath));
  const browserKey=c=>JSON.stringify([c.browser?.expectedUsername,c.browser?.connectionMode,c.browser?.cdpEndpoint,c.browser?.uploadTimeoutSeconds]);
  async function getPublisher(){
    const c=config(),key=browserKey(c);
    if(publisher && key!==publisherKey){await publisher.close();publisher=null;}
    if(!publisher){publisher=browserFactory(c,root);publisherKey=key;}else publisher.config=c;
    return publisher;
  }
  async function disconnect(){await publisher?.close();publisher=null;publisherKey=null;login=null;loginRelease?.();loginRelease=null;}
  function workerLocked(){const p=join(root,'data/worker.lock');if(!existsSync(p))return false;try{process.kill(Number(readFileSync(p,'utf8')),0);return true;}catch(error){return error.code!=='ESRCH';}}
  function snapshot(){
    const c=config();const jobs=withStore(s=>s.all());
    const paused=existsSync(join(root,'data/browser-paused.json'))?readJSON(join(root,'data/browser-paused.json')):null;
    const upcoming=jobs.filter(j=>['queued','ready','uploading','processing'].includes(j.status) && Date.parse(j.scheduled)>=Date.now());
    const totals={};for(const j of jobs)totals[j.status]=(totals[j.status]??0)+1;
    const cycle={next:upcoming.find(j=>j.cycleKey)?.video?.object ?? null};
    return {apiVersion:4,settings:view(c),revision:revision(),catalog:Object.values(catalog).map(({id,name,family,shape,peel,flesh})=>({id,name,family,shape,peel,flesh})),
      operation,lastResult,paused,loginOpen:!!login,browserConnected:!!publisher?.isConnected,workerLocked:workerLocked(),totals,next:upcoming[0]??null,cycle,
      jobs:jobs.slice(-2000).reverse().map(j=>({id:j.id,scheduled:j.scheduled,status:j.status,object:j.video?.object,name:catalog[j.video?.object]?.name ?? '本地视频',error:j.error,errorStage:j.errorStage,publishedEarly:!!j.publishedEarlyAt,canPublishNow:immediateCandidate(j),canRetry:j.status==='needs_review' && !j.containerId && !j.browserShareStartedAt && j.error?.startsWith('浏览器发布准备失败，'),hasVideo:!!j.file && existsSync(j.file)}))};
  }
  function execute(command,args=[]) {
    if(runCommand)return runCommand(command,args);
    return new Promise((res,rej)=>{
      const env={...process.env};if(!env.GUIJI_CUTTING_DEPS && existsSync(join(sourceRoot,'../.render-deps/node_modules')))env.GUIJI_CUTTING_DEPS=resolve(sourceRoot,'../.render-deps');
      const child=spawn(process.execPath,[join(root,'scripts/publish.mjs'),command,...args],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output=(output+data.toString()).slice(-6000);});
      child.once('error',rej);child.once('exit',code=>res({code,output}));
    });
  }
  async function action(command,args=[]){
    if(operation||login)throw new Error('另一个任务正在运行，请稍后再试');
    operation={command,startedAt:new Date().toISOString()};
    try{
      let result;
      if(!runCommand && config().publishMode==='browser' && (command==='run'||command==='publish-now'||command==='doctor'&&args.includes('--live'))){
        const release=acquireLock(root);let store;
        try{
          const browser=await getPublisher();
          if(command==='doctor'){
            const username=await browser.verifyAccount();browser.resume();result={code:0,output:'账号已验证：@'+username+'；连接已保持，可复用发布'};
          }else{
            store=new Store(root);
            if(command==='publish-now'){
              const {job,alreadyPublished}=await publishImmediately(args[0],store,browser,{root,renderJob,verifyVideo});
              result={code:0,output:(alreadyPublished?'任务已发布，未重复分享：':'已提前发布，原计划不会重复发布：')+job.id};
            }else{
              const summary=await runBrowserSchedule(config(),store,browser,{root,renderJob,verifyVideo});
              result={code:summary.paused||summary.failed?1:0,output:`已备片 ${summary.prepared} 条，已发布 ${summary.published} 条，准备失败 ${summary.failed} 条`+(summary.paused?'；队列已暂停，请核对账号和任务状态':'；浏览器连接保持复用')};
            }
          }
        }finally{store?.close();release();}
      }else result=await execute(command,args);
      lastResult={...result,command,at:new Date().toISOString()};
      atomicJSON(root,runtimePath,lastResult);return lastResult;
    }catch(error){lastResult={command,code:1,at:new Date().toISOString(),output:error.message};atomicJSON(root,runtimePath,lastResult);return lastResult;}
    finally{operation=null;}
  }
  function saveSettings(body){
    if(operation||login)throw new Error('任务进行中，请先等待任务结束再修改排期');
    if(body.revision!==revision())throw new Error('配置已更新，请刷新面板再保存');
    const release=acquireLock(root);
    try{
      const old=config(),s=body.settings;
      if(!s||!Array.isArray(s.times)||s.times.length<1||s.times.length>24)throw new Error('每天发布次数应为 1–24 次');
      const next=structuredClone(old);
      next.automation={...old.automation,enabled:old.automation?.enabled===true};
      next.browser={...old.browser,expectedUsername:s.username,connectionMode:s.connectionMode ?? old.browser.connectionMode ?? 'dedicated',cdpEndpoint:s.cdpEndpoint ?? old.browser.cdpEndpoint ?? 'auto'};
      next.schedule={...old.schedule,times:s.times,utcOffset:s.utcOffset,daysAhead:s.daysAhead,renderAheadHours:s.renderAheadHours,lateGraceMinutes:s.lateGraceMinutes};
      next.video={...old.video,objects:s.strategy==='cycle_all'?[...objectIds]:s.objects,strategy:s.strategy,cuts:s.cuts,seconds:s.seconds,width:s.width,fps:s.fps};
      next.caption=s.caption;validateConfig(next);
      if(publisher?.isConnected && browserKey(old)!==browserKey(next))throw new Error('修改账号或连接地址前，请先点击“断开连接”');
      const changed=JSON.stringify([old.schedule,old.video,old.caption])!==JSON.stringify([next.schedule,next.video,next.caption]);
      if(changed)next.planRevision=randomUUID();
      atomicJSON(root,join(root,'data/publisher-config.backup.json'),old);
      const store=new Store(root);let removed=0;
      try{
        store.db.exec('BEGIN IMMEDIATE');
        if(changed)removed=store.replaceFuture();
        atomicJSON(root,configPath,next);store.db.exec('COMMIT');
      }catch(error){store.db.exec('ROLLBACK');atomicJSON(root,configPath,old);throw error;}finally{store.close();}
      const added=withStore(st=>st.plan(next));return {removed,added};
    }finally{release();}
  }
  async function tick(){
    if(stopping||operation||login)return;
    const c=config();if(!c.automation?.enabled || Date.now()-lastTick<c.schedule.pollSeconds*1000)return;
    if(existsSync(join(root,'data/browser-paused.json'))||workerLocked())return;
    lastTick=Date.now();await action('run',['--live','--once']);
  }
  const send=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  const server=createServer(async(req,res)=>{
    const host=req.headers.host;
    if(host!==`127.0.0.1:${server.address().port}` && host!==`localhost:${server.address().port}`)return send(res,403,{error:'仅允许本机访问'});
    const url=new URL(req.url,'http://'+host);
    try{
      if(req.method==='GET' && url.pathname==='/api/state')return send(res,200,snapshot());
      if(req.method==='GET' && url.pathname.startsWith('/media/')){
        const id=url.pathname.slice(7);if(!/^[a-f0-9]{16}$/.test(id))return send(res,404,{error:'视频不存在'});
        const job=withStore(st=>st.get(id));if(!job?.file||!existsSync(job.file))return send(res,404,{error:'视频不存在'});
        const {createReadStream}=await import('node:fs');const size=statSync(job.file).size;
        const range=req.headers.range;
        if(range){
          const match=/^bytes=(\d+)-(\d*)$/.exec(range);
          if(!match){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}
          const start=Number(match[1]),end=Math.min(size-1,match[2]?Number(match[2]):size-1);
          if(start>end||start>=size){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}
          res.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});createReadStream(job.file,{start,end}).pipe(res);return;
        }
        res.writeHead(200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':size});createReadStream(job.file).pipe(res);return;
      }
      if(req.method==='GET' && ['/','/app.js','/style.css'].includes(url.pathname)){
        const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
        let content=readFileSync(join(sourceRoot,'panel',file));
        if(file==='index.html')content=Buffer.from(content.toString().replace('__PANEL_TOKEN__',token));
        res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(content);return;
      }
      if(req.method!=='POST')return send(res,404,{error:'不存在的接口'});
      if(req.headers.origin!==`http://${host}` || req.headers['x-panel-token']!==token)return send(res,403,{error:'请从本机面板执行操作'});
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>65536)return send(res,413,{error:'请求过大'});}
      const body=JSON.parse(raw||'{}');
      if(url.pathname==='/api/settings')return send(res,200,{ok:true,...saveSettings(body)});
      if(url.pathname==='/api/automation'){
        if(typeof body.enabled!=='boolean')throw new Error('启停值无效');
        const c=config();
        if(body.enabled && (operation||login||workerLocked()))throw new Error('请先等待当前任务结束');
        c.automation={...c.automation,enabled:body.enabled};atomicJSON(root,configPath,c);
        lastTick=0;send(res,200,{ok:true,enabled:body.enabled,finishing:!!operation});if(body.enabled)void tick();return;
      }
      if(url.pathname==='/api/action'){
        if(!['prepare','doctor','plan'].includes(body.command))throw new Error('不支持的操作');
        if(operation||login)throw new Error('任务进行中');
        void action(body.command,body.command==='doctor' && body.live?['--live']:[]);return send(res,202,{ok:true});
      }
      if(url.pathname==='/api/login/open'){
        if(operation||login)throw new Error('任务进行中');
        loginRelease=acquireLock(root);
        try{login=await getPublisher();await login.open();await login.page.goto('https://www.instagram.com/',{waitUntil:'domcontentloaded',timeout:60000});return send(res,200,{ok:true});}
        catch(error){await disconnect();throw error;}
      }
      if(url.pathname==='/api/login/verify'){
        if(!login)throw new Error('请先打开登录窗口');
        const username=await login.verifyAccount();login.resume();login=null;loginRelease();loginRelease=null;
        lastResult={command:'login',code:0,output:'已验证账号 @'+username,at:new Date().toISOString()};atomicJSON(root,runtimePath,lastResult);return send(res,200,{ok:true});
      }
      if(url.pathname==='/api/login/close'){
        if(operation)throw new Error('任务执行中，请等待发布结束后再断开');
        await disconnect();return send(res,200,{ok:true});
      }
      if(url.pathname==='/api/publish-now'){
        if(operation||login)throw new Error('另一个任务正在执行，请稍后再试');
        if(config().publishMode!=='browser')throw new Error('立即发布目前支持 Edge 浏览器模式');
        const job=withStore(st=>st.get(body.id));
        if(job?.status==='published')return send(res,200,{ok:true,alreadyPublished:true});
        if(!immediateCandidate(job))throw new Error('只能提前发布尚未开始的待生成或待发布任务');
        if(existsSync(join(root,'data/browser-paused.json')))throw new Error('发布队列已暂停，请先验证账号并核对待处理任务');
        if(workerLocked())throw new Error('其他发布任务正在运行，请稍后再试');
        void action('publish-now',[body.id]);return send(res,202,{ok:true});
      }
      if(url.pathname==='/api/job'){
        if(operation||login)throw new Error('任务进行中');
        const release=acquireLock(root);
        try{withStore(st=>{const j=st.get(body.id);if(!j)throw new Error('任务不存在');
          if(body.action==='retry'){retryBrowserJob(j,st);return;}
          if(body.action!=='cancel'||!['queued','ready'].includes(j.status)||j.containerId||j.browserShareStartedAt)throw new Error('只能取消尚未开始上传的任务');
          j.status='cancelled';st.save(j);
        });}finally{release();}return send(res,200,{ok:true});
      }
      return send(res,404,{error:'不存在的接口'});
    }catch(error){send(res,400,{error:error.message});}
  });
  const timer=autoTick?setInterval(()=>{void tick().catch(error=>{lastResult={command:'scheduler',code:1,output:error.message};});},2000):null;
  return {server,snapshot,tick,close:async()=>{stopping=true;if(timer)clearInterval(timer);await disconnect();if(server.listening)await new Promise(r=>server.close(r));}};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.GUIJI_PANEL_PORT ?? 4318);
  const open=()=>{if(process.argv.includes('--open') && process.platform==='win32')spawn('explorer.exe',['http://127.0.0.1:'+port],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});};
  const app=createPanel();app.server.listen(port,'127.0.0.1',()=>{console.log('Guiji 控制面板 http://127.0.0.1:'+app.server.address().port);open();});
  app.server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'面板已启动或端口被占用，请访问 http://127.0.0.1:'+port:error.message);process.exit(1);});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
}
