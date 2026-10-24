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
test('crop handles resize only their edges, stop at photo limits, and cannot flip', async () => {
  const {adjustCrop}=await import('../docs/signature.mjs');
  const rect={x:100,y:80,w:400,h:200}, start={x:0,y:0};
  assert.deepEqual(adjustCrop(rect,'resize','se',start,{x:30,y:20},800,400),{x:100,y:80,w:430,h:220});
  assert.deepEqual(adjustCrop(rect,'resize','nw',start,{x:-200,y:-200},800,400),{x:0,y:0,w:500,h:280});
  assert.deepEqual(adjustCrop(rect,'resize','w',start,{x:1000,y:1000},800,400),{x:496,y:80,w:4,h:200});
  assert.deepEqual(adjustCrop(rect,'resize','s',start,{x:0,y:1000},800,400),{x:100,y:80,w:400,h:320});
});
test('moving a crop preserves its size and drawing works in both directions', async () => {
  const {adjustCrop}=await import('../docs/signature.mjs');
  const rect={x:100,y:80,w:400,h:200};
  assert.deepEqual(adjustCrop(rect,'move','',{x:0,y:0},{x:900,y:-900},800,400),{x:400,y:0,w:400,h:200});
  assert.deepEqual(adjustCrop(rect,'new','',{x:700,y:300},{x:100,y:40},800,400),{x:100,y:40,w:600,h:260});
});
