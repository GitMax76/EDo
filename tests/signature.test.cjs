const {test} = require('node:test');
const assert = require('node:assert/strict');
test('uneven paper becomes transparent while blue and black strokes remain', async () => {
  const {cleanSignature, inkBounds} = await import('../docs/signature.mjs');
  const w = 256, h = 128, data = new Uint8ClampedArray(w * h * 4);
  for (let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const i=(y*w+x)*4, shade=170+Math.round(x/w*75);
    data.set([shade,shade,shade,255],i);
    if(y>=60&&y<=63&&x>=30&&x<=220) data.set(x<120?[15,20,80,255]:[15,15,15,255],i);
  }
  const out=cleanSignature(data,w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const alpha=out[(y*w+x)*4+3];
    if(y>=60&&y<=63&&x>=30&&x<=220) assert.ok(alpha>200);
    else assert.equal(alpha,0);
  }
  assert.deepEqual(inkBounds(out,w,h),{x:24,y:54,width:203,height:16});
});
test('blank or transparent pictures produce no signature', async () => {
  const {cleanSignature,inkBounds}=await import('../docs/signature.mjs');
  for(const alpha of [0,255]) {
    const data=new Uint8ClampedArray(64*64*4);
    for(let i=0;i<data.length;i+=4)data.set([255,255,255,alpha],i);
    assert.equal(inkBounds(cleanSignature(data,64,64),64,64),null);
  }
});
