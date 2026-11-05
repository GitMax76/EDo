const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../docs/pages.mjs');
test('page selection handles ranges, deduplicates and follows document order', async()=>{
  const {parsePageSelection:parse}=await load();
  assert.deepEqual(parse('5, 1, 3–4, 3, 2-2',6),[0,1,2,3,4]);
  assert.deepEqual(parse(' 1-1 ',1),[0]);
  for(const value of ['', '0','7','3-2','1.5','1,,2','1-','1e2','1-999999999999','-1','2/3']) assert.throws(()=>parse(value,6),Error,value);
});
test('copies are independent, stay inside page bounds and keep image transparency', async()=>{
  const {duplicateForPage:copy}=await load();
  const original={id:'one',type:'image',data:'data:image/png;base64,abc',x:90,y:190,w:100,h:50,metadata:{v:1}};
  const duplicate=copy(original,200,250,{id:'two',offset:18});
  assert.equal(duplicate.id,'two');assert.equal(duplicate.data,original.data);
  assert.equal(duplicate.x,72);assert.equal(duplicate.y,172);
  duplicate.metadata.v=2;assert.equal(original.metadata.v,1);
  const small=copy(original,50,80,{id:'small'});
  assert.equal(small.w,50);assert.equal(small.h,25);assert.equal(small.x,0);assert.equal(small.y,55);
  assert.deepEqual(original,{id:'one',type:'image',data:'data:image/png;base64,abc',x:90,y:190,w:100,h:50,metadata:{v:1}});
});
