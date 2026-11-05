const {chromium,webkit}=require('playwright');
const {readFile}=require('node:fs/promises');
const http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {PDFDocument,StandardFonts}=require('../docs/vendor/pdf-lib.min.js');
const root=path.resolve(__dirname,'../docs');
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.join(root,pathname==='/'?'index.html':pathname);
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
  try{res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}
});
async function fixture(name,count,sizes=[]){
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  for(let i=0;i<count;i++){const p=pdf.addPage(sizes[i]||[595,842]);p.drawText(`${name}${i+1}`,{x:15,y:p.getHeight()-30,font,size:14});}
  return {name:`${name}.pdf`,mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())};
}
async function run(engine,mobile=false){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('edo-guide-v2-seen','true'));
    const tap=async (selector,options={})=>mobile?page.locator(selector).tap(options):page.locator(selector).click(options);
    const settle=()=>page.waitForFunction(()=>document.getElementById('busy').hidden);
    const state=()=>page.evaluate(()=>JSON.stringify(window.pdfEditor.state.pages));
    const count=()=>page.evaluate(()=>window.pdfEditor.state.pages.length);
    const nElements=i=>page.evaluate(i=>window.pdfEditor.state.pages[i].elements.length,i);
    async function choose(button,files){const picker=page.waitForEvent('filechooser');await tap(button);await (await picker).setFiles(files);await settle();}
    async function openSelection(mode){await tap(mode==='copy'?'#copy-pages':'#extract-pages');await page.waitForSelector('#pages-dialog[open]');}
    async function copyAll(){await openSelection('copy');await tap('#pages-all');await tap('#pages-submit');await page.waitForSelector('#pages-dialog',{state:'hidden'});await settle();}
    await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.pdfEditor);
    assert.equal(await page.locator('#extract-pages').isDisabled(),true);
    await choose('#open',await fixture('A',3,[[595,842],[120,160],[842,595]]));
    await page.waitForFunction(()=>window.pdfEditor.state.pages.length===3);
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=100;const x=c.getContext('2d');x.strokeStyle='#111';x.lineWidth=5;x.beginPath();x.moveTo(15,70);x.bezierCurveTo(100,0,140,90,280,30);x.stroke();return c.toDataURL();});
    await page.locator('#image-input').setInputFiles({name:'firma.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')});
    await page.waitForSelector('.signature-dialog[open]');await tap('.signature-dialog [data-action=original]');
    await page.waitForFunction(()=>window.pdfEditor.state.pages[0].elements.length===1);
    const original=await page.evaluate(()=>structuredClone(window.pdfEditor.state.pages[0].elements[0]));
    await tap('#quick-duplicate');assert.equal(await nElements(0),2);
    let copy=await page.evaluate(()=>window.pdfEditor.state.pages[0].elements[1]);
    assert.notEqual(copy.id,original.id);assert.equal(copy.data,original.data);assert.equal(copy.w,original.w);assert.equal(copy.x,original.x+18);
    await tap('#undo');await settle();assert.equal(await nElements(0),1);
    await tap(`[data-id="${original.id}"]`,{position:{x:4,y:4}});
    if(mobile)await tap('#duplicate-element');else await page.keyboard.press('Control+d');
    assert.equal(await nElements(0),2);
    // Editing a duplicate does not modify the original.
    await tap('#smaller');copy=await page.evaluate(()=>window.pdfEditor.state.pages[0].elements[1]);assert.ok(copy.w<original.w);
    assert.deepEqual(await page.evaluate(()=>window.pdfEditor.state.pages[0].elements[0]),original);
    await openSelection('copy');await page.locator('#pages-range').fill('1');await tap('#pages-submit');
    assert.ok((await page.locator('#pages-error').innerText()).includes('Duplica'));assert.equal(await nElements(1),0);
    await page.locator('#pages-range').fill('2, 3, 3');await tap('#pages-submit');await settle();await page.waitForSelector('#pages-dialog',{state:'hidden'});
    assert.equal(await nElements(1),1);assert.equal(await nElements(2),1);
    const copied=await page.evaluate(()=>window.pdfEditor.state.pages[1].elements[0]);
    assert.equal(copied.w,120);assert.equal(copied.x,0);assert.ok(copied.y+copied.h<=160);assert.equal(copied.data,png);
    assert.notEqual(copied.id,copy.id);
    await tap('#undo');await settle();assert.equal(await nElements(1),0);assert.equal(await nElements(2),0);
    await tap(`[data-id="${original.id}"]`,{position:{x:4,y:4}});await copyAll();assert.equal(await nElements(1),1);assert.equal(await nElements(2),1);
    const beforeMerge=await state();
    await choose('#merge',[]);assert.equal(await state(),beforeMerge);
    await choose('#merge',[await fixture('B',2),{name:'rotto.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')}]);
    assert.equal(await state(),beforeMerge,'failed batch import is atomic');assert.equal(await page.evaluate(()=>window.pdfEditor.state.sources.length),1);
    await choose('#merge',[await fixture('B',2),await fixture('C',1)]);
    await page.waitForFunction(()=>window.pdfEditor.state.pages.length===6);await settle();
    assert.deepEqual(await page.evaluate(()=>window.pdfEditor.state.pages.map(p=>p.source)),[0,0,0,1,1,2]);
    assert.deepEqual((JSON.parse(await state())).slice(0,3),JSON.parse(beforeMerge),'merge keeps editable additions');
    assert.equal(await page.evaluate(()=>window.pdfEditor.state.index),3,'first appended page becomes visible');
    await tap('#next');await tap('#next');await page.waitForFunction(()=>window.pdfEditor.state.index===5);await tap('#pagebefore');await page.waitForFunction(()=>window.pdfEditor.state.index===4);await tap('#rotate');
    await page.waitForFunction(()=>window.pdfEditor.state.pages[4].rotation===90);await settle();
    const beforeExtract=await state(),history=await page.evaluate(()=>window.pdfEditor.state.history.length);
    await openSelection('extract');await page.locator('#pages-range').fill('7');await tap('#pages-submit');assert.equal(await page.locator('#pages-dialog').isVisible(),true);assert.ok((await page.locator('#pages-error').innerText()).includes('1 a 6'));
    await page.locator('#pages-range').fill('1, 2, 5-6');page.once('dialog',d=>d.dismiss());await tap('#pages-submit');assert.equal(await page.locator('#pages-dialog').isVisible(),true,'cancel export confirmation keeps selection available');
    page.once('dialog',d=>d.accept());const extracted=page.waitForEvent('download');await tap('#pages-submit');const download=await extracted;await settle();
    const bytes=await readFile(await download.path()),pdf=await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(),4);assert.equal(pdf.getPage(2).getRotation().angle,90);assert.equal(pdf.getPage(1).getWidth(),120);
    const text=await page.evaluate(async values=>{const pdfjs=await import('./vendor/pdf.mjs');const doc=await pdfjs.getDocument({data:new Uint8Array(values),isEvalSupported:false}).promise;try{const a=[];for(let i=1;i<=doc.numPages;i++)a.push((await (await doc.getPage(i)).getTextContent()).items.map(x=>x.str).join(' '));return a;}finally{await doc.destroy();}},Array.from(bytes));
    assert.deepEqual(text,['','','C1','B2'],'edited pages are rendered, untouched extracted pages preserve selectable text and document order');
    assert.equal(await state(),beforeExtract);assert.equal(await page.evaluate(()=>window.pdfEditor.state.history.length),history,'extraction has no mutation or undo checkpoint');
    await openSelection('extract');await tap('#pages-cancel');assert.equal(await state(),beforeExtract);
    const projectDownload=page.waitForEvent('download');await tap('#save-project');const projectBytes=await readFile(await (await projectDownload).path());
    const saved=JSON.parse(projectBytes);assert.equal(saved.sources.length,3);assert.equal(saved.pages.length,6);
    const ids=saved.pages.flatMap(p=>p.elements.map(e=>e.id));assert.equal(new Set(ids).size,ids.length,'each copy has its own id');
    page.once('dialog',d=>d.accept());const complete=page.waitForEvent('download');await tap('#export');const full=await PDFDocument.load(await readFile(await (await complete).path()));assert.equal(full.getPageCount(),6);await settle();
    // Undo rotation, reorder, then the whole batch import as one action.
    await tap('#undo');await tap('#undo');await tap('#undo');await page.waitForFunction(()=>window.pdfEditor.state.pages.length===3);assert.equal(await state(),beforeMerge);
    page.once('dialog',d=>d.accept());await page.locator('#project-input').setInputFiles({name:'riprendi.pdfe.json',mimeType:'application/json',buffer:projectBytes});await page.waitForFunction(()=>window.pdfEditor.state.pages.length===6);await settle();
    assert.equal(await state(),beforeExtract,'merged PDF sources and all copies survive project round trip');
    await tap('#blank');await page.waitForFunction(()=>window.pdfEditor.state.pages.length===7);await openSelection('extract');
    const blankDownload=page.waitForEvent('download');await tap('#pages-submit');const blank=await PDFDocument.load(await readFile(await (await blankDownload).path()));assert.equal(blank.getPageCount(),1);assert.equal(blank.getPage(0).getWidth(),595);
    await openSelection('extract');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await tap('#pages-cancel');
    assert.deepEqual(errors,[]);
    console.log(`${engine.name()} ${mobile?'mobile':'desktop'}: duplicate/resize/undo, copies on smaller pages, atomic multi-PDF merge, reordered/rotated extraction, preserved text, blank pages and project round trip passed`);
  }finally{await browser.close();}
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await run(chromium);await run(webkit,true);}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
