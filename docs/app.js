import { dominantColor } from './background.mjs';
import { prepareSignature } from './signature-ui.mjs';
import * as pdfjs from './vendor/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', import.meta.url).href;
const $ = id => document.getElementById(id);
const {PDFDocument, StandardFonts, rgb, degrees} = PDFLib;
const S = {sources: [], pages: [], index: 0, tool: 'move', selected: null, scale: 1, zoom: 1,
  history: [], dirty: false, name: 'documento.pdf', width: 595, height: 842, renderId: 0, textItems: [], drag: null};
let toastTimer, imagePoint, renderTask, busyDepth = 0, inlineEdit = null, renderedViewerWidth = null;
const clone = value => JSON.parse(JSON.stringify(value));
const page = () => S.pages[S.index];
const element = () => page()?.elements.find(e => e.id === S.selected);
const uid = () => crypto.randomUUID();
const editorAction = (type, detail = {}) => window.dispatchEvent(new CustomEvent('edo:action', {detail: {type, ...detail}}));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500); }
function status(message) { $('status').textContent = message; }
async function busy(message, action) {
  busyDepth++; $('busy').hidden = false; $('busytext').textContent = message;
  try { return await action(); } catch (error) { console.error(error); toast(error.message || 'Operazione non riuscita. Riprova.'); }
  finally { busyDepth--; if (!busyDepth) $('busy').hidden = true; }
}
function checkpoint() {
  S.history.push({pages: clone(S.pages), index: S.index});
  if (S.history.length > 20) S.history.shift();
  S.dirty = true; updateUI();
}
function updateUI() {
  const loaded = S.pages.length > 0;
  document.body.classList.toggle('has-document',loaded);
  for (const id of ['export', 'save-project', 'rotate', 'blank', 'merge']) $(id).disabled = !loaded;
  $('delete-page').disabled = S.pages.length < 2;
  $('pagebefore').disabled = !loaded || S.index === 0;
  $('pageafter').disabled = !loaded || S.index === S.pages.length-1;
  $('prev').disabled = !loaded || S.index === 0;
  $('next').disabled = !loaded || S.index === S.pages.length-1;
  $('undo').disabled = !S.history.length;
  $('filename').textContent = loaded ? S.name : 'Il tuo prossimo PDF, pronto da sistemare.';
  $('unsaved').textContent = S.dirty ? '• Modifiche in corso' : '';
  $('pagecount').textContent = S.pages.length;
  $('counter').textContent = loaded ? `Pagina ${S.index+1} di ${S.pages.length}` : 'Nessuna pagina';
  $('zoomlabel').textContent = `${Math.round(S.scale*100)}%`;
}
function tool(name) {
  commitInline();
  S.tool = name;
  for (const b of document.querySelectorAll('[data-tool]')) { b.classList.toggle('active', b.dataset.tool === name); b.setAttribute('aria-pressed', b.dataset.tool === name); }
  const hints = {move: 'Trascina per spostare. Doppio clic sul tuo testo per scriverci direttamente dentro.', text: 'Trascina un riquadro sulla pagina, poi scrivi direttamente al suo interno.', image: 'Fai clic sulla pagina, poi scegli una tua immagine o firma.', correct: 'Trascina sulla parte da coprire. Scrivi nel riquadro oppure premi Fatto per lasciarlo vuoto.', highlight: 'Trascina un rettangolo sulla parte che vuoi evidenziare.', redact: 'Trascina sull’area da oscurare: nel PDF esportato il contenuto sotto la banda sarà eliminato.'};
  $('hinttext').textContent = hints[name];
  $('paper').style.cursor = name === 'move' ? 'default' : 'crosshair';
  editorAction('tool-selected', {tool: name});
}
function inspector() {
  const e = element();
  $('element-controls').hidden = !e;
  $('element-title').textContent = e ? ({text: 'Il tuo testo', image: 'La tua immagine', highlight: 'La tua evidenziazione', redact: 'La tua area oscurata', correct: 'Il tuo bianchetto'}[e.type]) : 'Un clic, poi sposta.';
  $('element-help').textContent = e ? 'Trascina per spostare. Usa questi comandi per rifinire.' : 'Seleziona una tua aggiunta sulla pagina per modificarla.';
  if (!e) return;
  $('background-field').hidden=e.type!=='correct';
  $('element-background').value=e.background||'#ffffff';
  const text = ['text', 'correct'].includes(e.type);
  $('text-field').hidden = !text; $('size-field').hidden = !text; $('color-field').hidden = !text;
  $('apply').hidden = !text;
  $('clean-signature').hidden = e.type !== 'image';
  $('element-text').value = e.text || ''; $('element-size').value = e.size || 16;
  $('element-color').value = e.color || '#172b42';
}
function listPages() {
  const list = $('pagelist'); list.replaceChildren();
  S.pages.forEach((p, i) => {
    const b = document.createElement('button'); b.className = 'page-item'+(i === S.index ? ' active' : '');
    const sheet = document.createElement('span'); sheet.className = 'sheet'; sheet.textContent = i+1;
    const label = document.createElement('span'); label.textContent = `Pagina ${i+1}`;
    const note = document.createElement('small'); note.textContent = p.elements.length ? `${p.elements.length} aggiunte` : p.blank ? 'Pagina vuota' : 'Originale';
    label.append(note); b.append(sheet, label); b.onclick = () => navigate(i); list.append(b);
  });
}
function drawElements() {
  const layer = $('layer'); layer.replaceChildren();
  for (const e of page()?.elements || []) {
    const node = document.createElement('div'); node.className = 'element'+(e.id === S.selected ? ' selected' : ''); node.dataset.id = e.id;
    Object.assign(node.style, {left: `${e.x*S.scale}px`, top: `${e.y*S.scale}px`, width: `${e.w*S.scale}px`, height: `${e.h*S.scale}px`});
    const content = document.createElement('div'); content.className = 'content';
    if (e.type === 'image') { const img = document.createElement('img'); img.src = e.data; img.alt = 'Immagine aggiunta'; content.append(img); }
    else if (e.type === 'highlight') node.style.background = '#ffd94d60';
    else if (e.type === 'redact') node.style.background = '#000';
    else { content.textContent = e.text; content.style.fontSize = `${e.size*S.scale}px`; content.style.color = e.color; if (e.type === 'correct') node.style.background = e.background||'#ffffff'; }
    node.append(content);
    if (e.id === S.selected) { const handle = document.createElement('span'); handle.className = 'handle'; handle.dataset.resize = 'true'; node.append(handle); }
    layer.append(node);
  }
  inspector();
}
async function render() {
  commitInline();
  const token = ++S.renderId;
  if (renderTask) { renderTask.cancel(); renderTask = null; }
  if (!page()) return;
  document.body.classList.add('has-document');
  const p = page();
  let sourcePage = null;
  if (!p.blank) sourcePage = await S.sources[p.source].pdf.getPage(p.number);
  if (token !== S.renderId) return;
  const viewport = sourcePage?.getViewport({scale: 1});
  S.width = p.width = viewport?.width || p.width || 595;
  S.height = p.height = viewport?.height || p.height || 842;
  const rotated = p.rotation % 180 !== 0;
  const displayWidth = rotated ? S.height : S.width;
  const available = Math.max(180, $('viewer').clientWidth - (innerWidth < 760 ? 40 : 64));
  renderedViewerWidth = $('viewer').clientWidth;
  S.scale = Math.min(2.5, available/displayWidth*S.zoom);
  const w = S.width*S.scale, h = S.height*S.scale;
  Object.assign($('paper').style, {width: `${w}px`, height: `${h}px`, transform: ({0:'none',90:`translate(${h}px,0) rotate(90deg)`,180:`translate(${w}px,${h}px) rotate(180deg)`,270:`translate(0,${w}px) rotate(270deg)`})[p.rotation]});
  Object.assign($('rotationBox').style, {width:`${rotated?h:w}px`,height:`${rotated?w:h}px`});
  $('welcome').hidden = true; $('rotationBox').hidden = false;
  const canvas = $('pdfcanvas'), dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(w*dpr); canvas.height = Math.ceil(h*dpr);
  const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0,0,canvas.width,canvas.height);
  if (sourcePage) {
    const task = sourcePage.render({canvasContext:ctx, viewport:sourcePage.getViewport({scale:S.scale*dpr})});
    renderTask = task;
    try { await task.promise; } catch(error) { if (error.name !== 'RenderingCancelledException') throw error; }
    if (token !== S.renderId) return;
    renderTask = null;
    const text = await sourcePage.getTextContent();
    if (token !== S.renderId) return;
    S.textItems = text.items.filter(i=>i.str?.trim()).map(i => {
      const t = pdfjs.Util.transform(viewport.transform, i.transform);
      const height = Math.hypot(t[2],t[3]);
      return {text:i.str,x:t[4],y:t[5]-height,w:Math.max(i.width,8),h:height*1.25,size:height};
    });
  } else S.textItems = [];
  drawElements(); listPages(); updateUI();
}
async function navigate(index) { commitInline(); S.index=clamp(index,0,S.pages.length-1);S.selected=null;await render();$('viewer').scrollTop=0; }
async function sourceFrom(bytes, name) {
  const bytesCopy = new Uint8Array(bytes);
  const pdf = await pdfjs.getDocument({data:bytesCopy.slice(),isEvalSupported:false,enableXfa:false,useSystemFonts:true}).promise;
  return {bytes:bytesCopy,name,pdf};
}
async function openPDF(file, append=false) {
  commitInline();
  if (!file) return;
  if (!append && S.dirty && !confirm('Aprire un altro documento? Se vuoi conservare queste modifiche, prima salva il progetto.')) return;
  return await busy('Apro il tuo PDF…', async()=>{
    const source = await sourceFrom(await file.arrayBuffer(), file.name);
    const sourceIndex = append ? S.sources.length : 0;
    const newPages = Array.from({length:source.pdf.numPages},(_,i)=>({source:sourceIndex,number:i+1,rotation:0,elements:[]}));
    if (append) { checkpoint(); S.sources.push(source);S.pages.push(...newPages); }
    else { for (const s of S.sources) s.pdf.destroy(); S.sources=[source];S.pages=newPages;S.index=0;S.selected=null;S.history=[];S.dirty=false;S.name=file.name;S.zoom=1; }
    await render(); tool('move'); status(append?'PDF aggiunto in fondo al documento.':'PDF aperto. Scegli uno strumento a sinistra.');
    editorAction('document-opened');
    return true;
  });
}
function coordinates(event) {
  const box = $('rotationBox').getBoundingClientRect();
  const x=(event.clientX-box.left)/S.scale, y=(event.clientY-box.top)/S.scale;
  return ({0:{x,y},90:{x:y,y:S.height-x},180:{x:S.width-x,y:S.height-y},270:{x:S.width-y,y:x}})[page().rotation];
}
function sampleBackground(rect) {
  const canvas=$('pdfcanvas'),ctx=canvas.getContext('2d'),samples=[];
  const sx=canvas.width/S.width,sy=canvas.height/S.height;
  for(let i=0;i<=24;i++){const t=i/24;for(const [x,y] of [[rect.x+rect.w*t,rect.y],[rect.x+rect.w*t,rect.y+rect.h],[rect.x,rect.y+rect.h*t],[rect.x+rect.w,rect.y+rect.h*t]]){
    samples.push(Array.from(ctx.getImageData(clamp(Math.round(x*sx),0,canvas.width-1),clamp(Math.round(y*sy),0,canvas.height-1),1,1).data));
  }}
  return dominantColor(samples);
}
function beginInline(rect, initial='', target=null, type='text', size=16) {
  commitInline();
  inlineEdit = {page:page(), rect, target, type, size, originalSize:size, color:target?.color||'#172b42',background:type==='correct'?(target?.background||sampleBackground(rect)):null};
  const editor=$('inline-editor');
  Object.assign(editor.style,{left:`${rect.x*S.scale}px`,top:`${rect.y*S.scale}px`,width:`${rect.w*S.scale}px`,height:`${rect.h*S.scale}px`});
  editor.classList.toggle('correction',type==='correct');
  editor.style.background=inlineEdit.background||'';
  $('inline-text').style.background=inlineEdit.background||'';
  const actions=editor.querySelector('.inline-actions');
  actions.style.top=rect.y+rect.h+35>S.height?'auto':'100%';
  actions.style.bottom=rect.y+rect.h+35>S.height?'100%':'auto';
  $('inline-text').value=initial;
  $('inline-text').style.fontSize=`${size*S.scale}px`;
  $('inline-text').style.color=inlineEdit.color;
  editor.hidden=false;
  if(target){const node=$('layer').querySelector(`[data-id="${target.id}"]`);if(node)node.style.visibility='hidden';}
  $('hinttext').textContent='Scrivi nel riquadro. Quando hai finito, fai clic fuori oppure premi Fatto. Esc annulla.';
  $('inline-text').focus();
  if(initial)$('inline-text').select();
  editorAction('inline-opened', {elementType: type});
}
function fitInlineText() {
  if(!inlineEdit)return;
  const input=$('inline-text');let size=inlineEdit.originalSize;
  input.style.fontSize=`${size*S.scale}px`;
  while(input.scrollHeight>input.clientHeight+2&&size>6){size=Math.max(6,size-.5);input.style.fontSize=`${size*S.scale}px`;}
  inlineEdit.size=size;
}
function commitInline(cancel=false) {
  if(!inlineEdit)return;
  const edit=inlineEdit,text=$('inline-text').value;
  fitInlineText();
  inlineEdit=null;$('inline-editor').hidden=true;
  if(!cancel && (text.trim() || edit.type==='correct')) {
    const changed=!edit.target||text!==edit.target.text||edit.size!==edit.target.size;
    if(changed){
      checkpoint();
      if(edit.target){edit.target.text=text;edit.target.size=edit.size;S.selected=edit.target.id;}
      else{const e={id:uid(),type:edit.type,text,size:edit.size,color:edit.color,...(edit.type==='correct'?{background:edit.background}:{}),...edit.rect};edit.page.elements.push(e);S.selected=e.id;}
    }
  }
  S.tool='move';
  for(const b of document.querySelectorAll('[data-tool]')){b.classList.toggle('active',b.dataset.tool==='move');b.setAttribute('aria-pressed',b.dataset.tool==='move');}
  $('hinttext').textContent='Testo pronto. Trascina per spostarlo, oppure fai doppio clic per scriverci di nuovo.';
  drawElements();listPages();updateUI();
  status(cancel?'Scrittura annullata.':'Testo confermato sulla pagina.');
  if(!cancel && (text.trim() || edit.type==='correct')) editorAction('text-confirmed', {elementType: edit.type, id: S.selected});
  else editorAction('inline-cancelled', {elementType: edit.type});
}
function addElement(e) { checkpoint(); e.id=uid();page().elements.push(e);S.selected=e.id;tool('move');drawElements();listPages();status('Elemento aggiunto. Trascinalo per spostarlo.');editorAction('element-added', {elementType: e.type, id: e.id}); }
function measuredText(text, size, maxWidth=350) {
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=`${size}px Arial`;
  const width=Math.min(maxWidth,Math.max(80,...text.split('\n').map(s=>ctx.measureText(s).width+8)));
  const lines=wrapText(ctx,text,width-4);return {w:width,h:Math.max(size*1.5,lines.length*size*1.25+4)};
}
async function pointerDown(event) {
  if (!page() || event.button !== 0) return;
  if(event.target.closest('#inline-editor'))return;
  commitInline();
  const pt=coordinates(event);if(pt.x<0||pt.y<0||pt.x>S.width||pt.y>S.height)return;
  const hit=event.target.closest('.element');
  if(S.tool==='move'){
    S.selected=hit?.dataset.id || null;
    if(hit){const e=element();S.drag={kind:event.target.dataset.resize?'resize':'move',start:pt,original:clone(e),changed:false,pointer:event.pointerId};}
    // Keep the clicked node alive so browsers can deliver a double-click.
    for(const node of $('layer').querySelectorAll('.element')){
      node.classList.toggle('selected',node.dataset.id===S.selected);
      for(const handle of node.querySelectorAll('.handle'))handle.remove();
      if(node.dataset.id===S.selected){const handle=document.createElement('span');handle.className='handle';handle.dataset.resize='true';node.append(handle);}
    }
    inspector();return;
  }
  if(S.tool==='image') {imagePoint=pt;$('image-input').click();}
  else{S.drag={kind:'area',start:pt,changed:false,pointer:event.pointerId};$('paper').setPointerCapture(event.pointerId);}
}
function pointerMove(event){
  if(!S.drag)return;const pt=coordinates(event),d=S.drag,dx=pt.x-d.start.x,dy=pt.y-d.start.y;
  if(d.kind==='area'){
    const x=clamp(Math.min(pt.x,d.start.x),0,S.width),y=clamp(Math.min(pt.y,d.start.y),0,S.height);
    Object.assign($('selection').style,{left:`${x*S.scale}px`,top:`${y*S.scale}px`,width:`${Math.min(Math.abs(dx),S.width-x)*S.scale}px`,height:`${Math.min(Math.abs(dy),S.height-y)*S.scale}px`});$('selection').hidden=false;
  }else{
    const e=element();if(!e)return;
    if(!d.changed&&Math.abs(dx)+Math.abs(dy)<=1)return;
    if(!d.changed&&Math.abs(dx)+Math.abs(dy)>1){checkpoint();d.changed=true;$('paper').setPointerCapture(event.pointerId);}
    if(d.kind==='move'){e.x=clamp(d.original.x+dx,0,Math.max(0,S.width-e.w));e.y=clamp(d.original.y+dy,0,Math.max(0,S.height-e.h));}
    else{e.w=clamp(d.original.w+dx,15,S.width-e.x);e.h=clamp(d.original.h+dy,10,S.height-e.y);}
    drawElements();
  }
}
function pointerUp(event){
  if(!S.drag)return;const d=S.drag;S.drag=null;
  if($('paper').hasPointerCapture(event.pointerId))$('paper').releasePointerCapture(event.pointerId);
  $('selection').hidden=true;
  if(d.changed && d.kind !== 'area') editorAction(d.kind==='resize'?'element-resized':'element-moved', {id:S.selected});
  if(d.kind==='area'){
    const pt=coordinates(event),x=clamp(Math.min(pt.x,d.start.x),0,S.width),y=clamp(Math.min(pt.y,d.start.y),0,S.height);
    const w=Math.min(Math.abs(pt.x-d.start.x),S.width-x),h=Math.min(Math.abs(pt.y-d.start.y),S.height-y);
    if(w>3&&h>3){
      if(S.tool==='text'||S.tool==='correct'){
        if(w<35||h<20){status('Trascina un riquadro un po’ più grande per scrivere al suo interno.');return;}
        const hits=S.tool==='correct'?S.textItems.filter(t=>t.x<x+w&&t.x+t.w>x&&t.y<y+h&&t.y+t.h>y):[];
        const initial='';
        beginInline({x,y,w,h},initial,null,S.tool,hits.length?clamp(hits[0].size,6,100):16);
      }else addElement({type:S.tool,x,y,w,h});
    }
  }
}
function wrapText(ctx,text,width){
  const lines=[];
  for(const paragraph of text.split('\n')){
    let line='';
    for(const char of paragraph){if(ctx.measureText(line+char).width>width&&line){lines.push(line);line=char;}else line+=char;}
    lines.push(line);
  }return lines;
}
function download(bytes,type,name){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function rasterize(p){
  let sourcePage=null;if(!p.blank)sourcePage=await S.sources[p.source].pdf.getPage(p.number);
  const viewport=sourcePage?.getViewport({scale:1});const width=viewport?.width||p.width||595,height=viewport?.height||p.height||842;
  const scale=Math.min(2.5,Math.sqrt(22000000/(width*height)));
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(sourcePage)await sourcePage.render({canvasContext:ctx,viewport:sourcePage.getViewport({scale})}).promise;
  ctx.scale(scale,scale);
  for(const e of p.elements){
    ctx.save();ctx.beginPath();ctx.rect(e.x,e.y,e.w,e.h);ctx.clip();
    if(e.type==='image'){const img=new Image();img.src=e.data;await img.decode();ctx.drawImage(img,e.x,e.y,e.w,e.h);}
    else if(e.type==='highlight'){ctx.fillStyle='#ffd94d';ctx.globalAlpha=.38;ctx.fillRect(e.x,e.y,e.w,e.h);}
    else if(e.type==='redact'){ctx.fillStyle='black';ctx.fillRect(e.x,e.y,e.w,e.h);}
    else{
      if(e.type==='correct'){ctx.fillStyle=e.background||'#ffffff';ctx.fillRect(e.x,e.y,e.w,e.h);}
      ctx.fillStyle=e.color;ctx.font=`${e.size}px Arial`;ctx.textBaseline='top';
      wrapText(ctx,e.text,e.w-2).forEach((line,i)=>ctx.fillText(line,e.x,e.y+i*e.size*1.25+e.size*.12));
    }ctx.restore();
  }
  return {bytes:await new Promise(resolve=>canvas.toBlob(async b=>resolve(new Uint8Array(await b.arrayBuffer())),'image/png')),width,height};
}
async function exportPDF(){
  commitInline();
  if(!page())return;
  const altered=S.pages.filter(p=>p.elements.length).length;
  if(altered&&!confirm(`Scaricare il PDF?\n\nLe ${altered} pagine con aggiunte o correzioni diventeranno immagini: il testo non sarà più selezionabile. Le bande nere rimuovono così il contenuto sottostante.\n\nPer continuare a spostare le aggiunte in futuro salva anche il progetto modificabile.`))return;
  await busy('Preparo il tuo PDF…',async()=>{
    const out=await PDFDocument.create();const loaded=new Map();
    for(let index=0;index<S.pages.length;index++){
      const p=S.pages[index];$('busytext').textContent=`Preparo la pagina ${index+1} di ${S.pages.length}…`;
      let target;
      if(p.elements.length){const raster=await rasterize(p);const image=await out.embedPng(raster.bytes);target=out.addPage([raster.width,raster.height]);target.drawImage(image,{x:0,y:0,width:raster.width,height:raster.height});target.setRotation(degrees(p.rotation));}
      else if(p.blank){target=out.addPage([p.width||595,p.height||842]);target.setRotation(degrees(p.rotation));}
      else{
        if(!loaded.has(p.source))loaded.set(p.source,await PDFDocument.load(S.sources[p.source].bytes));
        const [copied]=await out.copyPages(loaded.get(p.source),[p.number-1]);target=out.addPage(copied);target.setRotation(degrees((target.getRotation().angle+p.rotation)%360));
      }
    }
    out.setTitle('Documento modificato');out.setProducer('E.Do. — Editor Documenti');
    download(await out.save(),'application/pdf',S.name.replace(/\.pdf$/i,'')+'_modificato.pdf');status('PDF scaricato. Salva anche il progetto se vuoi riprendere le aggiunte.');editorAction('pdf-exported');
  });
}
function toBase64(bytes){let result='';for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(result);}
function fromBase64(string){return Uint8Array.from(atob(string),c=>c.charCodeAt(0));}
async function saveProject(){commitInline();await busy('Salvo il progetto modificabile…',async()=>{
  const project={format:'pdf-fast-editor',version:1,name:S.name,pages:S.pages,sources:S.sources.map(s=>({name:s.name,data:toBase64(s.bytes)}))};
  download(JSON.stringify(project),'application/json',S.name.replace(/\.pdf$/i,'')+'.pdfe.json');S.dirty=false;updateUI();status('Progetto salvato. Contiene anche il PDF originale: conservalo per te.');editorAction('project-saved');
});}
async function loadProject(file){
  if(!file)return;if(S.dirty&&!confirm('Aprire il progetto e lasciare le modifiche attuali?'))return;
  await busy('Riapro il progetto…',async()=>{
    const project=JSON.parse(await file.text());
    if(project.format!=='pdf-fast-editor'||project.version!==1||!Array.isArray(project.pages)||!project.pages.length||!Array.isArray(project.sources))throw Error('Questo file non è un progetto E.Do. valido.');
    const allowed=new Set(['text','correct','image','highlight','redact']);
    for(const p of project.pages){
      if(![0,90,180,270].includes(p.rotation)||!Array.isArray(p.elements))throw Error('Pagina progetto non valida.');
      if(!p.blank&&(!Number.isInteger(p.source)||p.source<0||p.source>=project.sources.length||!Number.isInteger(p.number)||p.number<1))throw Error('Riferimento pagina non valido.');
      for(const e of p.elements){
        if(!allowed.has(e.type)||![e.x,e.y,e.w,e.h].every(n=>Number.isFinite(n)&&n>=0)||!e.w||!e.h||e.w>20000||e.h>20000)throw Error('Elemento progetto non valido.');
        if(e.background!==undefined&&!/^#[0-9a-f]{6}$/i.test(e.background))throw Error('Colore sfondo non valido.');
        if(e.type==='image'&&!/^data:image\/(png|jpeg);base64,/.test(e.data))throw Error('Immagine progetto non valida.');
        if(['text','correct'].includes(e.type)&&(typeof e.text!=='string'||!Number.isFinite(e.size)||e.size<6||e.size>100||!/^#[0-9a-f]{6}$/i.test(e.color)))throw Error('Testo progetto non valido.');
      }
    }
    const sources=[];for(const s of project.sources)sources.push(await sourceFrom(fromBase64(s.data),s.name));
    for(const p of project.pages)if(!p.blank&&p.number>sources[p.source].pdf.numPages)throw Error('Pagina non presente nel documento originale.');
    for(const s of S.sources)s.pdf.destroy();S.sources=sources;S.pages=project.pages;S.name=String(project.name||'documento.pdf');S.history=[];S.index=0;S.selected=null;S.dirty=false;S.zoom=1;
    await render();status('Progetto riaperto: puoi continuare a spostare le tue aggiunte.');
    editorAction('document-opened');
  });
}
async function demo(){
  await busy('Preparo un esempio da provare…',async()=>{
    const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);
    let p=doc.addPage([595,842]);
    p.drawRectangle({x:0,y:718,width:595,height:124,color:rgb(.94,.97,.95)});
    p.drawText('UN PICCOLO PROMEMORIA',{x:54,y:780,size:10,font:bold,color:rgb(.12,.43,.32)});
    p.drawText('Le cose semplici, fatte bene.',{x:54,y:746,size:25,font:bold,color:rgb(.1,.19,.27)});
    p.drawText('Documento di esempio',{x:54,y:664,size:20,font:bold,color:rgb(.1,.19,.27)});
    const lines=['Questo PDF e qui per farti provare senza pensieri.','Puoi aggiungere una nota, inserire una firma o','sistemare le pagine con pochi clic.','','Appuntamento: venerdi 23 ottobre, ore 10:30','Luogo: ufficio al primo piano','','Da ricordare:','Portare i documenti e una copia del modulo.'];
    p.drawText(lines.join('\n'),{x:54,y:620,size:13,font,lineHeight:24,color:rgb(.28,.34,.4)});
    p.drawLine({start:{x:54,y:250},end:{x:541,y:250},thickness:1,color:rgb(.82,.87,.85)});
    p.drawText('Uno spazio per la tua nota',{x:54,y:225,size:11,font,color:rgb(.4,.5,.45)});
    p.drawText('E.Do.  /  Documento dimostrativo',{x:54,y:40,size:9,font,color:rgb(.5,.55,.58)});
    p=doc.addPage([595,842]);p.drawText('Una seconda pagina, tutta per te.',{x:54,y:760,size:23,font:bold,color:rgb(.1,.19,.27)});p.drawText('Prova a ruotarla, spostarla o eliminarla.',{x:54,y:718,size:13,font});
    const bytes=await doc.save();const opened=await openPDF(new File([bytes],'Esempio.pdf',{type:'application/pdf'}));
    if(opened&&page()){
      const dim=measuredText('Prova a trascinarmi!',17,250);
      page().elements.push({id:uid(),type:'text',text:'Prova a trascinarmi!',size:17,color:'#16785f',x:54,y:660,...dim});S.selected=page().elements[0].id;drawElements();listPages();
      toast('L’esempio è pronto. Trascina la nota verde oppure prova gli strumenti a sinistra.');
    }
  });
}
for(const b of document.querySelectorAll('[data-tool]'))b.onclick=()=>tool(b.dataset.tool);
for(const id of ['open','welcome-open'])$(id).onclick=()=>$('pdf-input').click();
$('pdf-input').onchange=e=>{openPDF(e.target.files[0]);e.target.value='';};
$('merge').onclick=()=>$('merge-input').click();$('merge-input').onchange=e=>{openPDF(e.target.files[0],true);e.target.value='';};
$('image-input').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file||!page())return;
  const targetPage=page(), point={...(imagePoint||{x:30,y:30})};
  const original=await busy('Apro l’immagine…',async()=>{
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
    if(!/^data:image\/(png|jpeg);base64,/.test(data))throw Error('Scegli una immagine PNG o JPEG.');
    return data;
  });
  if(!original)return;
  const data=await prepareSignature(original);if(!data||page()!==targetPage)return;
  await busy('Aggiungo l’immagine…',async()=>{
    const img=new Image();img.src=data;await img.decode();const w=Math.min(180,S.width,S.height*img.width/img.height),h=w*img.height/img.width;
    addElement({type:'image',data,w,h,x:clamp(point.x,0,S.width-w),y:clamp(point.y,0,S.height-h)});
  });
};
$('clean-signature').onclick=async()=>{
  const e=element();if(e?.type!=='image')return;
  const targetPage=page(), data=await prepareSignature(e.data);
  if(!data||page()!==targetPage||!targetPage.elements.includes(e)||data===e.data)return;
  const img=new Image();img.src=data;await img.decode();
  checkpoint();e.data=data;
  const w=Math.min(e.w,S.width-e.x,(S.height-e.y)*img.width/img.height);
  e.w=w;e.h=w*img.height/img.width;drawElements();listPages();status('Firma pulita. Puoi annullare la modifica.');
};
$('paper').addEventListener('pointerdown',event=>{pointerDown(event).catch(e=>toast(e.message));});
function cancelDrag(){const drag=S.drag;S.drag=null;$('selection').hidden=true;if(drag&&$('paper').hasPointerCapture(drag.pointer))$('paper').releasePointerCapture(drag.pointer);if(page())drawElements();}
$('paper').addEventListener('pointermove',pointerMove);$('paper').addEventListener('pointerup',pointerUp);$('paper').addEventListener('pointercancel',cancelDrag);
$('paper').addEventListener('lostpointercapture',()=>{if(S.drag)cancelDrag();});
window.addEventListener('blur',()=>{if(S.drag)cancelDrag();});
$('inline-done').onclick=()=>commitInline();
$('inline-cancel').onclick=()=>commitInline(true);
$('inline-text').addEventListener('input',fitInlineText);
$('inline-text').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();commitInline(true);}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();commitInline();}});
$('inline-text').addEventListener('blur',event=>{if(!$('inline-editor').contains(event.relatedTarget))commitInline();});
$('paper').addEventListener('dblclick',event=>{if(event.target.closest('#inline-editor'))return;const hit=event.target.closest('.element');const e=page()?.elements.find(e=>e.id===hit?.dataset.id);if(e&&['text','correct'].includes(e.type))beginInline({x:e.x,y:e.y,w:e.w,h:e.h},e.text,e,e.type,e.size);});
$('apply').onclick=()=>{const e=element();if(!e)return;const size=Number($('element-size').value);if(!Number.isFinite(size)||size<6||size>100){toast('Scegli una dimensione tra 6 e 100.');return;}checkpoint();e.text=$('element-text').value;e.size=size;e.color=$('element-color').value;if(e.type==='correct')e.background=$('element-background').value;if(e.type==='text'){const dim=measuredText(e.text,size,Math.min(400,S.width-e.x));e.w=dim.w;e.h=Math.min(S.height-e.y,dim.h);}drawElements();};
function resizeElement(factor){const e=element();if(!e)return;checkpoint();const f=Math.min(factor,(S.width-e.x)/e.w,(S.height-e.y)/e.h);e.w=Math.max(15,e.w*f);e.h=Math.max(10,e.h*f);if(['text','correct'].includes(e.type))e.size=clamp(e.size*f,6,100);drawElements();}
$('smaller').onclick=()=>resizeElement(1/1.15);$('bigger').onclick=()=>resizeElement(1.15);
$('delete-element').onclick=()=>{if(!element())return;checkpoint();page().elements=page().elements.filter(e=>e.id!==S.selected);S.selected=null;drawElements();listPages();};
$('undo').onclick=async()=>{const old=S.history.pop();if(!old)return;S.pages=old.pages;S.index=old.index;S.selected=null;S.dirty=true;await render();status('Ultima modifica annullata.');editorAction('undo');};
$('rotate').onclick=async()=>{checkpoint();page().rotation=(page().rotation+90)%360;await render();editorAction('page-rotated');};
async function movePage(delta){const target=S.index+delta;if(target<0||target>=S.pages.length)return;checkpoint();[S.pages[S.index],S.pages[target]]=[S.pages[target],S.pages[S.index]];S.index=target;S.selected=null;await render();}
$('pagebefore').onclick=()=>movePage(-1);$('pageafter').onclick=()=>movePage(1);
$('delete-page').onclick=async()=>{if(S.pages.length<2)return;if(!confirm(`Eliminare pagina ${S.index+1}? Puoi annullare l’operazione.`))return;checkpoint();S.pages.splice(S.index,1);S.index=Math.min(S.index,S.pages.length-1);S.selected=null;await render();};
$('blank').onclick=async()=>{checkpoint();S.pages.splice(S.index+1,0,{blank:true,rotation:0,width:595,height:842,elements:[]});await navigate(S.index+1);};
$('prev').onclick=()=>navigate(S.index-1);$('next').onclick=()=>navigate(S.index+1);
$('zoomin').onclick=()=>{S.zoom=Math.min(3,S.zoom*1.15);render();};$('zoomout').onclick=()=>{S.zoom=Math.max(.3,S.zoom/1.15);render();};$('fit').onclick=()=>{S.zoom=1;render();};
$('export').onclick=exportPDF;$('save-project').onclick=saveProject;$('load-project').onclick=()=>$('project-input').click();$('project-input').onchange=e=>{loadProject(e.target.files[0]);e.target.value='';};
$('demo').onclick=demo;$('close-info').onclick=()=>$('info-dialog').close();
document.addEventListener('dragover',e=>{e.preventDefault();});document.addEventListener('drop',e=>{e.preventDefault();const file=e.dataTransfer.files[0];if(file?.name.toLowerCase().endsWith('.pdf'))openPDF(file);});
window.addEventListener('beforeunload',e=>{if(S.dirty){e.preventDefault();e.returnValue='';}});
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea')||document.querySelector('dialog[open]'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('undo').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(page())saveProject();}if(e.key==='Delete'&&element())$('delete-element').click();});
// A phone keyboard changes viewport height, not PDF scale. Re-rendering on
// that height change would commit the text being typed before the user is done.
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);if(!page()||$('viewer').clientWidth===renderedViewerWidth)return;resizeTimer=setTimeout(()=>{if(page())render();},250);});
window.addEventListener('unhandledrejection',event=>{console.error(event.reason);toast(event.reason?.message||'Operazione non riuscita. Riprova.');});
// Debug state is local-only and useful for reproducible browser QA.
window.pdfEditor={state:S,demo,render,exportPDF,rasterize,beginInline,commitInline};
editorAction('ready');
updateUI();
if(new URLSearchParams(location.search).has('demo'))demo();
