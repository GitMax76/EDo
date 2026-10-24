const {chromium,webkit}=require('playwright');
const {readFile}=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../docs');
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.join(root,pathname==='/'?'index.html':pathname);
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
  try{res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}
});
async function check(engine,mobile=false){
  const browser=await engine.launch({headless:true});
  try{
    const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{viewport:{width:1280,height:900}});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const url=`http://127.0.0.1:${server.address().port}/`;
    const step=()=>page.locator('#guide-panel').getAttribute('data-step');
    const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const wait=async id=>{await page.waitForFunction(value=>document.getElementById('guide-panel').dataset.step===value,id);await settle();};
    const tap=async selector=>{const node=page.locator(selector);if(mobile)await node.tap();else await node.click();};
    async function drag(x,y,dx,dy){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:6});await page.mouse.up();await settle();}
    const noOverlap=async()=>{
      const r=await page.locator('#guide-spotlight').boundingBox(),c=await page.locator('#guide-panel').boundingBox();
      assert.ok(r&&c,'target and coach visible');
      assert.ok(r.x+r.width<=c.x||c.x+c.width<=r.x||r.y+r.height<=c.y||c.y+c.height<=r.y,'coach must not cover the actual target');
      return r;
    };
    async function draw(){const r=await noOverlap();await drag(r.x+15,r.y+15,Math.min(140,r.width-30),Math.min(48,r.height-25));}
    async function tapPaper(){
      await page.waitForFunction(()=>{const r=document.getElementById('guide-spotlight').getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#paper')&&window.pdfEditor.state.tool==='image';});
      const point=await page.locator('#guide-spotlight').evaluate(e=>{const r=e.getBoundingClientRect(),p=document.getElementById('paper').getBoundingClientRect();return {x:r.left+r.width/2-p.left,y:r.top+r.height/2-p.top};});
      if(mobile)await page.locator('#paper').tap({position:point});else await page.locator('#paper').click({position:point});
    }
    await page.goto(url);await page.waitForSelector('#guide-panel:not([hidden])');await wait('open');
    assert.equal(await page.locator('dialog[open]').count(),0,'tour has no modal backdrop');
    assert.equal(await page.locator('#open').isEnabled(),true,'actual app button is usable');
    await noOverlap();
    const cancelled=page.waitForEvent('filechooser');await tap('#open');await (await cancelled).setFiles([]);assert.equal(await step(),'open','cancelled file picker does not advance');
    const invalid=page.waitForEvent('filechooser');await tap('#open');await (await invalid).setFiles({name:'rotto.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});
    await page.waitForFunction(()=>document.getElementById('busy').hidden);assert.equal(await step(),'open','failed PDF does not advance');
    const {PDFDocument,StandardFonts}=require('../docs/vendor/pdf-lib.min.js');
    const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage([595,842]).drawText('Documento per la prova guidata',{x:50,y:750,font,size:20});pdf.addPage([595,842]);
    const picker=page.waitForEvent('filechooser');await tap('#open');await (await picker).setFiles({name:'prova.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
    await wait('textTool');assert.equal(await page.evaluate(()=>window.pdfEditor.state.pages.length),2);
    assert.equal(await step(),'textTool','opening a PDF does not pretend the tool was selected');
    await tap('[data-tool="text"]');await wait('textDraw');assert.equal(await page.locator('#guide-gesture').isVisible(),true);
    await draw();await wait('textWrite');assert.equal(await page.locator('#inline-text').isVisible(),true);
    await page.locator('#inline-text').fill('Nota guidata');await settle();assert.equal(await step(),'textWrite','typing alone does not complete the step');
    if(mobile){await page.setViewportSize({width:390,height:500});await page.waitForTimeout(350);await settle();await noOverlap();assert.equal(await step(),'textWrite','keyboard-sized height change must not commit the draft');assert.equal(await page.locator('#inline-text').inputValue(),'Nota guidata');await page.setViewportSize({width:390,height:844});await settle();}
    await noOverlap();await tap('#inline-done');await wait('move');
    const text=await page.evaluate(()=>window.pdfEditor.state.pages[0].elements.find(e=>e.text==='Nota guidata'));
    assert.ok(text);const t=await page.locator(`[data-id="${text.id}"]`).boundingBox();
    await drag(t.x+t.width/2,t.y+t.height/2,18,16);await wait('imageTool');
    await tap('[data-tool="image"]');await wait('imagePlace');
    const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=400;const x=c.getContext('2d');x.fillStyle='#654321';x.fillRect(0,0,800,400);x.fillStyle='#eee';x.fillRect(80,40,640,320);x.strokeStyle='#15255e';x.lineWidth=4;x.beginPath();x.moveTo(240,210);x.bezierCurveTo(330,130,420,260,550,190);x.stroke();return c.toDataURL();});
    await noOverlap();const photo=page.waitForEvent('filechooser');await tapPaper();
    await (await photo).setFiles({name:'firma.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});
    await wait('imageCrop');assert.equal(await page.locator('.signature-dialog #guide-panel').count(),1,'coach remains interactive in signature dialog');
    await noOverlap();const crop=await page.locator('.signature-source').boundingBox();
    await drag(crop.x+crop.width*.25,crop.y+crop.height*.3,crop.width*.5,crop.height*.4);await wait('imageInsert');
    assert.equal(await page.locator('#guide-next').isEnabled(),true);await noOverlap();
    await tap('.signature-dialog [data-action="insert"]');await wait('imageResize');
    assert.equal(await page.locator('body > #guide-panel').count(),1,'coach returns to app when signature dialog closes');
    const imageElement=await page.evaluate(()=>window.pdfEditor.state.pages[0].elements.find(e=>e.type==='image'));
    const handle=await page.locator(`[data-id="${imageElement.id}"] .handle`).boundingBox();
    await noOverlap();await drag(handle.x+handle.width/2,handle.y+handle.height/2,18,14);await wait('download');
    page.once('dialog',d=>d.dismiss());await tap('#export');assert.equal(await step(),'download','cancelled export does not advance');
    page.once('dialog',d=>d.accept());const download=page.waitForEvent('download');await tap('#export');await download;await wait('project');
    const save=page.waitForEvent('download');await tap('#save-project');await save;await wait('finish');
    const state=await page.evaluate(()=>JSON.stringify(window.pdfEditor.state.pages));await tap('#guide-finish');
    assert.equal(await page.evaluate(()=>localStorage.getItem('edo-guide-v2-seen')),'true');
    await tap('#help');await wait('textTool');assert.equal(await page.evaluate(()=>JSON.stringify(window.pdfEditor.state.pages)),state,'reopening the tour does not modify the document');
    await page.selectOption('#guide-route','signature');await wait('imageTool');await tap('[data-tool="image"]');await wait('imagePlace');
    await noOverlap();const skipPhoto=page.waitForEvent('filechooser');await tapPaper();await (await skipPhoto).setFiles({name:'firma.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});
    await wait('imageCrop');await tap('#guide-next');await wait('download');assert.equal(await page.locator('.signature-dialog[open]').count(),0,'skipping a signature leaves no blocking modal');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.pdfEditor.state.pages)),state,'skipping a photo does not alter the document');
    await page.selectOption('#guide-route','correction');await wait('correctTool');
    await tap('[data-tool="correct"]');await wait('correctDraw');await draw();await wait('correctWrite');
    await page.locator('#inline-text').fill('Correzione');await tap('#inline-done');await wait('download');
    assert.ok(await page.evaluate(()=>window.pdfEditor.state.pages[0].elements.some(e=>e.type==='correct'&&e.text==='Correzione')));
    await page.selectOption('#guide-route','pages');await wait('rotate');const rotation=await page.evaluate(()=>window.pdfEditor.state.pages[0].rotation);
    await tap('#rotate');await wait('undo');assert.notEqual(await page.evaluate(()=>window.pdfEditor.state.pages[0].rotation),rotation);
    await tap('#undo');await wait('download');assert.equal(await page.evaluate(()=>window.pdfEditor.state.pages[0].rotation),rotation);
    await tap('#guide-next');await wait('finish');
    await tap('#guide-install');await page.waitForSelector('#install-dialog[open]');assert.equal(await page.locator('#guide-panel').isVisible(),false);
    const selected=await page.locator('[data-platform][aria-pressed="true"]').getAttribute('data-platform');assert.equal(selected,mobile?'ios':'desktop');
    await tap('[data-platform="ios"]');assert.ok((await page.locator('#install-steps').innerText()).includes('Aggiungi alla schermata Home'));
    await tap('#install-close');await wait('finish');await tap('#guide-finish');
    await tap('#add-home');await page.waitForSelector('#install-dialog[open]');await tap('#install-close');
    await page.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.promptCalls=(window.promptCalls||0)+1;};e.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(e);});
    await tap('#add-home');await tap('[data-platform="android"]');await tap('#install-native');await page.waitForFunction(()=>document.getElementById('install-note').textContent.includes('più tardi'));assert.equal(await page.evaluate(()=>window.promptCalls),1);await tap('#install-close');
    // Closing the tutorial while typing must leave the user's draft intact.
    await tap('#help');await page.selectOption('#guide-route','basics');await wait('textTool');await tap('[data-tool="text"]');await wait('textDraw');await draw();await wait('textWrite');
    await tap('#inline-cancel');await wait('textTool');await tap('[data-tool="text"]');await wait('textDraw');await draw();await wait('textWrite');
    await page.locator('#inline-text').fill('Bozza da conservare');await settle();assert.equal(await page.locator('#inline-editor').isVisible(),true,'draft remains open before leaving the guide');await tap('#guide-skip');
    assert.equal(await page.locator('#inline-text').inputValue(),'Bozza da conservare');assert.equal(await page.locator('#inline-editor').isVisible(),true,'leaving the guide does not commit or discard a draft');
    await tap('#inline-cancel');
    const manifest=await (await page.request.get(url+'manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');
    for(const icon of manifest.icons.filter(i=>i.type==='image/png')){const response=await page.request.get(url+icon.src.replace('./',''));const bytes=await response.body(),size=Number(icon.sizes.split('x')[0]);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
    assert.deepEqual(errors,[]);await page.reload();await page.waitForFunction(()=>window.edoTour);assert.equal(await page.locator('#guide-panel').isVisible(),false,'completed or dismissed tour stays dismissed');
    await context.close();
    const blocked=await browser.newContext({viewport:{width:320,height:568},reducedMotion:'reduce'});await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Unavailable','SecurityError');}});});
    const small=await blocked.newPage();await small.goto(url);await small.waitForSelector('#guide-panel:not([hidden])');
    assert.equal(await small.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow on a small screen');
    assert.equal(await small.locator('#guide-spotlight').evaluate(e=>getComputedStyle(e).animationName),'none','reduced motion is respected');
    await small.click('#guide-skip');await small.click('#help');await small.keyboard.press('Escape');await blocked.close();
    console.log(`${engine.name()} ${mobile?'mobile':'desktop'}: real PDF picker, cancelled/failed actions, text draw/write/move, photo crop/insert/resize, exports, correction, rotate/undo, tour exit without draft loss, installation, storage, reduced motion passed`);
  }finally{await browser.close();}
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await check(chromium);await check(webkit,true);}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
