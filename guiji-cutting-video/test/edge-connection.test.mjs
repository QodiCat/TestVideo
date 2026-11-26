import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {localCdpEndpoint,inspectEdge,discoverEdgeEndpoint} from '../scripts/edge-connection.mjs';
import {BrowserInstagram,browserRuntime} from '../scripts/browser-publisher.mjs';
import {validateConfig} from '../scripts/publisher-core.mjs';

const project=fileURLToPath(new URL('../',import.meta.url));
process.env.GUIJI_CUTTING_DEPS ??= resolve(project,'../.render-deps');
const config=()=>JSON.parse(readFileSync(join(project,'publisher.example.json'),'utf8'));
test('existing Edge connection only accepts local HTTP endpoints without credentials or paths',()=>{
  for(const value of ['https://127.0.0.1:9222','http://192.168.1.5:9222','http://example.com:9222','http://user:password@localhost:9222','ws://localhost:9222/test','http://localhost:9222/path','http://localhost:9222?query=1'])assert.throws(()=>localCdpEndpoint(value));
  assert.equal(localCdpEndpoint('http://localhost:9222/'),'http://localhost:9222');
  const c=config();c.browser.connectionMode='existing';c.browser.cdpEndpoint='http://127.0.0.1:9222';assert.doesNotThrow(()=>validateConfig(c));
  c.browser.cdpEndpoint='http://example.com:9222';assert.throws(()=>validateConfig(c));
  c.browser.cdpEndpoint='auto';assert.doesNotThrow(()=>validateConfig(c));
});

test('auto detection reads the consent-enabled port file and rejects invalid records',()=>{
  const root=mkdtempSync(join(tmpdir(),'guiji-port-discovery-test-'));
  try{
    assert.throws(()=>discoverEdgeEndpoint(root),/edge:\/\/inspect/);
    writeFileSync(join(root,'DevToolsActivePort'),'53128\n/devtools/browser/a1b2-c3d4\n');assert.equal(discoverEdgeEndpoint(root),'http://127.0.0.1:53128');
    for(const data of ['0\n/devtools/browser/test','65536\n/devtools/browser/test','9222\nws://example.com/browser','not-a-port\n/devtools/browser/test']){
      writeFileSync(join(root,'DevToolsActivePort'),data);assert.throws(()=>discoverEdgeEndpoint(root),/无效/);
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('discovery rejects non-Edge and remote websocket redirects',async()=>{
  let metadata={Browser:'Chrome/158.0'};
  const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(metadata));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const endpoint='http://127.0.0.1:'+server.address().port;
  try{
    await assert.rejects(()=>inspectEdge(endpoint),/不是 Microsoft Edge/);
    metadata={Browser:'Edg/158.0',webSocketDebuggerUrl:'ws://example.com:9222/devtools/browser/test'};
    await assert.rejects(()=>inspectEdge(endpoint),/相同的本机端口/);
  }finally{await new Promise(r=>server.close(r));}
});

test('real Edge CDP attachment reuses Instagram tab and login context; disconnect keeps all tabs alive',async()=>{
  const root=mkdtempSync(join(tmpdir(),'guiji-edge-attach-test-'));
  const {chromium,executablePath}=browserRuntime(project);
  const profile=join(root,'profile');let owner,app;
  try{
    owner=await chromium.launchPersistentContext(profile,{executablePath,headless:true,args:['--remote-debugging-address=127.0.0.1','--remote-debugging-port=0']});
    await owner.route('https://www.instagram.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Local Instagram fixture</title><b>your_username</b>'}));
    const unrelated=owner.pages()[0];await unrelated.setContent('<title>Unrelated tab</title>Keep this tab');
    const instagram=await owner.newPage();await instagram.goto('https://www.instagram.com/');
    await owner.addCookies([{name:'test_login',value:'fixture-only',domain:'.instagram.com',path:'/'}]);
    const port=readFileSync(join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0];
    const c=config();c.browser.connectionMode='existing';c.browser.cdpEndpoint='http://127.0.0.1:'+port;
    assert.match((await inspectEdge(c.browser.cdpEndpoint)).browser,/Edg/);
    app=new BrowserInstagram(c,root);await app.open();
    assert.equal(app.context.pages().length,2);assert.match(app.page.url(),/instagram\.com/);
    assert.equal((await app.context.cookies('https://www.instagram.com')).find(c=>c.name==='test_login')?.value,'fixture-only');
    assert.equal(await app.verifyAccount(),'your_username');
    await app.close();assert.equal(unrelated.isClosed(),false);assert.equal(instagram.isClosed(),false);assert.equal(owner.pages().length,2);
    assert.equal(await unrelated.title(),'Unrelated tab');assert.equal(await instagram.title(),'Local Instagram fixture');
    await app.open();assert.equal(app.context.pages().length,2);await app.close();
    assert.equal(existsSync(join(root,'data/instagram-edge')),false,'must not create a dedicated profile');
  }finally{await app?.close();await owner?.close();rmSync(root,{recursive:true,force:true});}
});

test('unavailable existing endpoint never creates a new browser profile',async()=>{
  const root=mkdtempSync(join(tmpdir(),'guiji-edge-failure-test-'));
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  const c=config();c.browser.connectionMode='existing';c.browser.cdpEndpoint='http://127.0.0.1:'+port;
  const app=new BrowserInstagram(c,root);
  try{await assert.rejects(()=>app.open(),/不会启动新浏览器/);assert.equal(existsSync(join(root,'data/instagram-edge')),false);}
  finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
