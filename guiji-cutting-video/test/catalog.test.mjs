import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalog, objectIds, hasObject, gridRows, crossScale } from '../scripts/catalog.mjs';
import { configuration } from '../scripts/render.mjs';
import { validateConfig } from '../scripts/publisher-core.mjs';

test('100 unique complete presets accepted by renderer and publisher',()=>{
  assert.equal(objectIds.length,100);
  assert.equal(new Set(Object.values(catalog).map(s=>s.name)).size,100);
  const publisher=JSON.parse(readFileSync(new URL('../publisher.example.json',import.meta.url),'utf8'));
  publisher.video.objects=objectIds;
  assert.doesNotThrow(()=>validateConfig(publisher));
  for(const id of objectIds){
    const s=catalog[id];
    assert.ok(['ellipsoid','box','cylinder'].includes(s.shape),id);
    assert.ok(s.radii.length===3 && s.radii.every(n=>n>0 && n<2),id);
    assert.ok(s.label.length<=26,id);
    for(const key of ['peel','flesh','core','accent'])assert.match(s[key],/^#[a-f0-9]{6}$/i);
    const config=JSON.parse(readFileSync(new URL(`../examples/objects/${id}.json`,import.meta.url),'utf8'));
    assert.equal(configuration(config).object,id);
  }
});

test('reject prototype keys and unknown objects in all entry points',()=>{
  for(const object of ['constructor','__proto__','toString','unknown',null,42]){
    assert.equal(hasObject(object),false);
    assert.throws(()=>configuration({object,cuts:[10]}),/Unknown object/);
    const c=JSON.parse(readFileSync(new URL('../publisher.example.json',import.meta.url),'utf8'));
    c.video.objects=[object];assert.throws(()=>validateConfig(c),/objects/);
  }
});

test('grid counting matches independent geometric inclusion for all shapes and asymmetric grids',()=>{
  for(const shape of ['ellipsoid','box','cylinder'])for(const dims of [[1,1,1],[5,4,4],[7,5,9],[34,34,34]]){
    const rows=new Array(dims[2]).fill(0),expected=[...rows];
    gridRows(dims,shape,(j,x,z,first,last)=>{rows[j]+=Math.max(0,last-first+1);});
    for(let i=0;i<dims[0];i++)for(let k=0;k<dims[1];k++)for(let j=0;j<dims[2];j++){
      const x=(2*i+1)/dims[0]-1,y=(2*k+1)/dims[1]-1,z=1-(2*j+1)/dims[2];
      if(shape==='box' || (shape==='cylinder' ? x*x+z*z : x*x+y*y+z*z)<=1+1e-9)expected[j]++;
    }
    assert.deepEqual(rows,expected,`${shape} ${dims}`);
  }
});

test('cross-section scales respect cylinder height, sphere radius and box dimensions',()=>{
  assert.deepEqual(crossScale('box',0.8),[1,1]);
  const [x,y]=crossScale('cylinder',0.8);assert.ok(Math.abs(x-0.6)<1e-9);assert.equal(y,1);
  const [a,b]=crossScale('ellipsoid',0.8);assert.ok(Math.abs(a-0.6)<1e-9);assert.equal(a,b);
});
