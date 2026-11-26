// Real WebGL smoke test, local only. Does not schedule or publish anything.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { catalog, objectIds, gridRows } from './catalog.mjs';
import { configuration, loadDependencies, findBrowser, startServer } from './render.mjs';

const folder=resolve(process.argv[2] ?? 'output/catalog-verification');
await mkdir(folder,{recursive:true});
const {chromium,three}=loadDependencies();
const server=await startServer(three);
let browser;
const results=[];
try {
  browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-unsafe-swiftshader','--disable-background-timer-throttling']});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>typeof window.configureVideo==='function');
  for(const [index,id] of objectIds.entries()) {
    const config=configuration({object:id,cuts:[10,50,100],seconds:[2,2,2],width:360,fps:24,seed:1511});
    await page.evaluate(c=>window.configureVideo(c),config);
    const info=await page.evaluate(()=>[0,0.5,0.8,1.12,1.95,2,3.95,4,5.95].map(t=>window.inspectFrame(t)));
    for(const n of [0,1,2,5,7])assert.equal(info[n].pieces,0,`${id}: blocks before cross cut or at reset`);
    assert.equal(info[1].direction,'VERTICAL',id);
    assert.equal(info[2].direction,'HORIZONTAL',id);
    assert.equal(info[3].direction,'CROSS CUT',id);
    assert.ok(info[3].interiorVisible && info[3].visibleFragments>0 && info[3].pieces>0,id);
    for(const [n,cuts,dims] of [[4,10,[5,4,4]],[6,50,[18,18,17]],[8,100,[35,34,34]]]){
      let count=0;gridRows(dims,catalog[id].shape,(j,x,z,first,last)=>{count+=Math.max(0,last-first+1);});
      assert.equal(info[n].cuts,cuts,id);assert.equal(info[n].pieces,count,id);assert.equal(info[n].direction,'DICED',id);
    }
    // Give the first row enough time to fall so the exposed texture is visible.
    await page.evaluate(c=>window.configureVideo(c),{...config,seconds:[5.6,6.4,7.6]});
    for(const [label,time] of [['whole',0],['cut',4.12]]){
      const [jpg]=await page.evaluate(t=>window.renderBatch([t]),time);
      await writeFile(join(folder,`${String(index+1).padStart(3,'0')}-${id}-${label}.jpg`),Buffer.from(jpg,'base64'));
    }
    assert.deepEqual(errors,[],id);
    results.push({id,name:catalog[id].name,shape:catalog[id].shape,frames:info,passed:true});
    console.log(`${index+1}/${objectIds.length} ${id} OK`);
  }
  // Boundary cut counts, multiple stages, and high-density fragment sampling.
  for(const shape of ['ellipsoid','box','cylinder']) {
    const object=objectIds.find(id=>catalog[id].shape===shape);
    for(const count of [1,2,3,1000]) {
      await page.evaluate(c=>window.configureVideo(c),configuration({object,cuts:[count],seconds:[2],width:360,fps:24}));
      const end=await page.evaluate(()=>window.inspectFrame(1.95));
      assert.equal(end.cuts,count);assert.equal(end.pieces===0,count<3);
      assert.ok(Number.isFinite(end.pieces));
    }
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(folder,'report.json'),JSON.stringify({passed:results.length,boundaryChecks:12,results},null,2)+'\n');
  console.log(`Verified ${results.length} objects; report: ${folder}`);
} finally {
  await browser?.close();await new Promise(r=>server.close(r));
}
