// Run with Playwright installed: node tests/signature-browser.cjs
const {chromium, webkit} = require('playwright');
const {readFile} = require('node:fs/promises');
const http = require('node:http');
const assert = require('node:assert/strict');
const path = require('node:path');
const server = http.createServer(async (req,res) => {
  if(req.url === '/') { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/docs/style.css"><link rel="stylesheet" href="/docs/leggibile.css"><body><button id="open">Apri firma</button><script type="module">import {prepareSignature} from "/docs/signature-ui.mjs"; window.prepareSignature=prepareSignature;</script>'); return; }
  const pathname=new URL(req.url,'http://localhost').pathname;
  const types={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
  try { const file=await readFile(path.join(__dirname,'..',pathname)); res.setHeader('Content-Type',types[path.extname(pathname)]||'application/octet-stream');res.end(file); } catch {res.statusCode=404;res.end();}
});
async function run(engine, mobile=false) {
  const browser=await engine.launch({headless:true});
  try {
    const page=await browser.newPage(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('edo-guide-v1-seen','true'));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>window.prepareSignature);
    await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=800;c.height=400;const ctx=c.getContext('2d');
      ctx.fillStyle='#694329';ctx.fillRect(0,0,800,400);
      const bg=ctx.createLinearGradient(100,0,700,0);bg.addColorStop(0,'#b8b8b8');bg.addColorStop(1,'#fff');ctx.fillStyle=bg;ctx.fillRect(100,50,600,300);
      ctx.strokeStyle='#15265e';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(220,210);ctx.bezierCurveTo(260,120,320,270,450,180);ctx.bezierCurveTo(480,130,500,260,560,200);ctx.stroke();
      ctx.fillStyle='#222';ctx.fillRect(170,100,12,12); // deliberately foreign mark
      window.original=c.toDataURL();
      document.getElementById('open').onclick=()=>{window.done=false;window.prepareSignature(window.original).then(v=>{window.value=v;window.done=true;});};
    });
    await page.click('#open'); await page.waitForSelector('dialog[open]');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    // Crop via pointer first, including reversed drag.
    const box=await page.locator('.signature-source').boundingBox();
    await page.mouse.move(box.x+box.width*.9,box.y+box.height*.9);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.1,box.y+box.height*.1,{steps:3});await page.mouse.up();
    const cropRect=()=>page.locator('.signature-crop-outline').evaluate(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top),w:parseFloat(e.style.width),h:parseFloat(e.style.height)}));
    const originalCrop=await cropRect();
    const handle=await page.locator('[data-handle="se"]').boundingBox();assert.ok(handle.width>=44&&handle.height>=44,'finger-sized handles');
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
    await page.mouse.move(handle.x+handle.width/2+box.width*.03,handle.y+handle.height/2+box.height*.03,{steps:3});await page.mouse.up();
    const resized=await cropRect();assert.equal(resized.x,originalCrop.x);assert.equal(resized.y,originalCrop.y);assert.ok(resized.w>originalCrop.w&&resized.h>originalCrop.h,'corner grows selection');
    const center={x:box.x+box.width*(resized.x+resized.w/2)/100,y:box.y+box.height*(resized.y+resized.h/2)/100};
    await page.mouse.move(center.x,center.y);await page.mouse.down();await page.mouse.move(center.x+box.width*.02,center.y+box.height*.02,{steps:3});await page.mouse.up();
    const moved=await cropRect();assert.equal(moved.w,resized.w);assert.equal(moved.h,resized.h);assert.ok(moved.x>resized.x&&moved.y>resized.y,'move preserves selection size');
    await page.locator('[data-handle="w"]').press('ArrowLeft');assert.ok((await cropRect()).x<moved.x,'keyboard fine tuning');
    await page.click('[data-action="reset"]');
    await page.locator('summary').click();
    for(const [i,value] of ['20','20','20','25'].entries()) { await page.locator(`[data-margin="${i}"]`).fill(value); await page.locator(`[data-margin="${i}"]`).dispatchEvent('change'); }
    await page.waitForFunction(()=>!document.querySelector('[data-action="insert"]').disabled);
    await page.waitForFunction(()=>{const c=document.querySelector('.signature-preview');return c.width===480&&c.height>=219&&c.getContext('2d').getImageData(15,25,1,1).data[3]>200;});
    const before=await page.evaluate(()=>{const c=document.querySelector('.signature-preview');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let total=0,first=null;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>200){total++;first??={x,y};}return {w:c.width,h:c.height,alpha:d[3],ink:d[(25*c.width+15)*4+3],total,first,margins:[...document.querySelectorAll('[data-margin]')].map(e=>e.value)};});
    assert.equal(before.alpha,0,'paper transparent '+JSON.stringify(before));assert.ok(before.ink>200,'foreign mark present before erasing '+JSON.stringify(before));
    await page.click('[data-action="eraser"]');
    const pb=await page.locator('.signature-preview').boundingBox();
    const ex=pb.x+pb.width*16/before.w,ey=pb.y+pb.height*26/before.h;
    if(mobile) await page.touchscreen.tap(ex,ey); else await page.mouse.click(ex,ey);
    await page.waitForFunction(()=>document.querySelector('.signature-preview').getContext('2d').getImageData(15,25,1,1).data[3]===0);
    const after=await page.evaluate(()=>{const c=document.querySelector('.signature-preview');return c.getContext('2d').getImageData(15,25,1,1).data[3];});assert.equal(after,0,'eraser removes residue');
    await page.click('[data-action="insert"]');await page.waitForFunction(()=>window.done);
    const png=await page.evaluate(async()=>{const i=new Image();i.src=window.value;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;let ink=0,border=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const a=d[(y*c.width+x)*4+3];if(a){ink++;if(x===0||y===0||x===c.width-1||y===c.height-1)border++;}}return {width:i.width,height:i.height,ink,border};});
    assert.ok(png.width<480&&png.height<150,'PNG trimmed to signature');assert.ok(png.ink>200);assert.equal(png.border,0,'transparent padding');
    await page.click('#open');await page.waitForSelector('dialog[open]');await page.click('[data-action="original"]');await page.waitForFunction(()=>window.done);assert.equal(await page.evaluate(()=>window.value===window.original),true);
    await page.click('#open');await page.waitForSelector('dialog[open]');await page.keyboard.press('Escape');await page.waitForFunction(()=>window.done);assert.equal(await page.evaluate(()=>window.value),null);
    // Even a portrait photo fits on screen: handles are attached to the photo,
    // rather than sitting below a tall canvas that needs scrolling.
    await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=1600;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#000';x.fillRect(100,800,300,3);window.landscape=window.original;window.original=c.toDataURL();});
    await page.click('#open');await page.waitForSelector('dialog[open]');
    await page.locator('.signature-crop-stage').scrollIntoViewIfNeeded();
    const portrait=await page.locator('.signature-source').boundingBox();assert.ok(portrait.height<=page.viewportSize().height*.46+2,'portrait photo is bounded by viewport height');
    const visible=await page.locator('.signature-source').evaluate(e=>{const r=e.getBoundingClientRect(),d=e.closest('dialog').getBoundingClientRect();return r.top>=Math.max(0,d.top)&&r.bottom<=Math.min(innerHeight,d.bottom);});assert.equal(visible,true,'whole photo visible while dragging');
    assert.equal(await page.locator('[data-handle]').evaluateAll(buttons=>buttons.every(e=>{const r=e.getBoundingClientRect(),d=e.closest('dialog').getBoundingClientRect();return r.top>=Math.max(0,d.top)&&r.bottom<=Math.min(innerHeight,d.bottom)&&r.left>=d.left&&r.right<=d.right;})),true,'all crop handles visible with the portrait photo');
    await page.click('[data-action="cancel"]');await page.evaluate(()=>window.original=window.landscape);
    const original=await page.evaluate(()=>window.original);
    await page.goto(`http://127.0.0.1:${server.address().port}/docs/index.html?demo`);
    await page.waitForFunction(()=>window.pdfEditor?.state.pages.length===2);
    await page.locator('#image-input').setInputFiles({name:'firma.png',mimeType:'image/png',buffer:Buffer.from(original.split(',')[1],'base64')});
    await page.waitForSelector('dialog.signature-dialog[open]');await page.locator('dialog.signature-dialog summary').click();
    for(const [i,value] of ['20','35','20','30'].entries()) {await page.locator(`[data-margin="${i}"]`).fill(value);await page.locator(`[data-margin="${i}"]`).dispatchEvent('change');}
    await page.click('[data-action="insert"]');
    await page.waitForFunction(()=>window.pdfEditor.state.pages[0].elements.some(e=>e.type==='image'));
    assert.equal(await page.locator('#clean-signature').isVisible(),true);
    const save=page.waitForEvent('download');await page.click('#save-project');
    const project=JSON.parse(await readFile(await (await save).path(),'utf8'));
    const image=project.pages[0].elements.find(e=>e.type==='image');assert.ok(image.data.startsWith('data:image/png;base64,'));
    assert.notEqual(image.data,original,'only the cleaned image is saved in the project');
    page.once('dialog', dialog=>dialog.accept());
    const exp=page.waitForEvent('download');await page.click('#export');
    const {PDFDocument}=require('../docs/vendor/pdf-lib.min.js');
    const pdf=await PDFDocument.load(await readFile(await (await exp).path()));assert.equal(pdf.getPageCount(),2);
    await page.click('#clean-signature');await page.waitForSelector('dialog.signature-dialog[open]');await page.click('[data-action="cancel"]');
    await page.click('#undo');assert.equal(await page.evaluate(()=>window.pdfEditor.state.pages[0].elements.some(e=>e.type==='image')),false);
    assert.deepEqual(errors,[]);console.log(`${engine.name()} ${mobile?'mobile touch':'desktop'}: crop, transparency, eraser, trimmed PNG, original, cancellation, image insertion, project, PDF export, undo passed`);
  } finally {await browser.close();}
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await run(chromium);await run(webkit,true);}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
