(() => {
  const $ = id => document.getElementById(id);
  const seenKey = 'edo-guide-v2-seen';
  const routes = {
    basics: {label: 'Primi passi: testo e firma', steps: ['open','textTool','textDraw','textWrite','move','imageTool','imagePlace','imageCrop','imageInsert','imageResize','download','project','finish']},
    signature: {label: 'Inserire e pulire una firma', steps: ['open','imageTool','imagePlace','imageCrop','imageInsert','imageResize','download','finish']},
    correction: {label: 'Usare il bianchetto', steps: ['open','correctTool','correctDraw','correctWrite','download','finish']},
    pages: {label: 'Ruotare una pagina', steps: ['open','rotate','undo','download','finish']}
  };
  const definitions = {
    open: {group:'open', title:'Apri il tuo PDF', text:'Segui la freccia verso “Apri PDF”, in alto. Tocca il pulsante evidenziato e scegli il documento: poi continuiamo insieme.', selector:'#open'},
    textTool: {group:'text', title:'Scegli “Scrivi testo”', text:'Tocca il pulsante evidenziato tra gli strumenti dell’app.', selector:'[data-tool="text"]'},
    textDraw: {group:'text', title:'Disegna il riquadro', text:'Sulla pagina, tieni premuto e trascina come nell’animazione. Puoi scegliere tu il punto in cui scrivere.', selector:'#paper', gesture:'draw'},
    textWrite: {group:'text', title:'Scrivi nel riquadro', text:'Scrivi una breve nota nel riquadro che hai appena creato. Poi premi “Fatto”.', selector:'#inline-text'},
    move: {group:'text', title:'Sposta il tuo testo', text:'Trascina il testo che hai appena aggiunto e rilascialo nel punto che preferisci.', selector:()=>textId ? `[data-id="${CSS.escape(textId)}"]` : '[data-tool="move"]', gesture:'move'},
    correctTool: {group:'correct', title:'Scegli “Bianchetto”', text:'Tocca il pulsante evidenziato. Potrai coprire una parte del documento e riscrivere sopra.', selector:'[data-tool="correct"]'},
    correctDraw: {group:'correct', title:'Copri la parte da correggere', text:'Tieni premuto e trascina un riquadro sul testo da coprire, come nell’animazione.', selector:'#paper', gesture:'draw'},
    correctWrite: {group:'correct', title:'Scrivi la correzione', text:'Scrivi la sostituzione e premi “Fatto”. Per lasciare soltanto la copertura puoi premere “Fatto” anche senza scrivere.', selector:'#inline-text'},
    imageTool: {group:'image', title:'Scegli “Immagine o firma”', text:'Tocca il pulsante evidenziato per preparare l’inserimento della firma.', selector:'[data-tool="image"]'},
    imagePlace: {group:'image', title:'Tocca il punto della pagina', text:'Tocca la pagina dove vuoi mettere la firma. Si aprirà la scelta della foto dal tuo dispositivo.', selector:'#paper', gesture:'tap'},
    imageCrop: {group:'image', title:'Ritaglia la firma sulla foto', text:'Trascina intorno alla firma oppure regola i pallini verdi. Escludi tavolo, bordi del foglio e segni estranei.', selector:'.signature-crop-stage', gesture:'draw'},
    imageInsert: {group:'image', title:'Controlla e inserisci la firma', text:'Controlla lo sfondo trasparente. Usa la gomma o regola il nero se serve, poi premi “Inserisci firma pulita”.', selector:'.signature-dialog [data-action="insert"]'},
    imageResize: {group:'image', title:'Regola la grandezza della firma', text:'Trascina il piccolo angolo verde in basso a destra della firma. Puoi anche spostarla trascinandola al centro.', selector:()=>imageId ? `[data-id="${CSS.escape(imageId)}"] .handle` : '[data-tool="move"]', gesture:'resize'},
    rotate: {group:'pages', title:'Prova a ruotare la pagina', text:'Tocca “Ruota di 90°”. Nel prossimo passaggio ti mostro come annullare la prova.', selector:'#rotate'},
    undo: {group:'pages', title:'Annulla la rotazione', text:'Premi “Annulla” per tornare all’orientamento precedente.', selector:'#undo'},
    download: {group:'download', title:'Scarica il PDF', text:'Premi il pulsante evidenziato e conferma. Le pagine modificate diventeranno immagini: il loro testo non sarà più selezionabile.', selector:'#export'},
    project: {group:'project', title:'Conserva il lavoro modificabile', text:'“Salva progetto” conserva le aggiunte da riprendere con “Apri progetto”. Il progetto contiene anche il PDF originale: tienilo per te.', selector:'#save-project'},
    finish: {group:'finish', title:'Hai completato il percorso', text:'Puoi continuare a lavorare. Da “Come funziona” puoi rifare la guida o scegliere solo firma, bianchetto o pagine.', selector:'#help'}
  };
  let running = false, paused = false, route = 'basics', index = 0, textId = null, imageId = null, writing = false, frame = 0, previousTarget = null, previousDescription = null, afterSignature = null, preserveDraft = false;
  const panel = document.createElement('section'); panel.id = 'guide-panel'; panel.className = 'tour-panel'; panel.hidden = true; panel.setAttribute('role','region'); panel.setAttribute('aria-label','Guida interattiva');
  panel.innerHTML = `<div class="tour-top"><span id="guide-progress"></span><button id="guide-skip" type="button" class="quiet">Esci dalla guida</button></div><label class="tour-route">Cosa vuoi imparare?<select id="guide-route">${Object.entries(routes).map(([key,value])=>`<option value="${key}">${value.label}</option>`).join('')}</select></label><div aria-live="polite" aria-atomic="true"><h2 id="guide-title"></h2><p id="guide-body"></p></div><div class="tour-actions"><button id="guide-show" type="button">Mostra dove</button><button id="guide-demo" type="button" hidden>Usa un esempio</button><button id="guide-next" type="button">Salta questo argomento</button><button id="guide-install" type="button" hidden>Aggiungi alla Home</button><button id="guide-details" type="button" hidden>Tutte le istruzioni</button><button id="guide-finish" type="button" class="primary" hidden>Ho finito</button></div>`;
  const ring = document.createElement('div'); ring.id = 'guide-spotlight'; ring.hidden = true; ring.setAttribute('aria-hidden','true');
  const gesture = document.createElement('div'); gesture.id = 'guide-gesture'; gesture.hidden = true; gesture.setAttribute('aria-hidden','true');
  gesture.innerHTML = '<div class="tour-drag-area"></div><svg class="tour-finger" viewBox="0 0 40 48"><path d="M12 26V8a4 4 0 0 1 8 0v13l3-1 4 2 4 1 3 5-2 14H15L6 31q-2-5 3-5l3 3" fill="#fff" stroke="#116a54" stroke-width="3" stroke-linejoin="round"/></svg>';
  const connector=document.createElement('div');connector.id='guide-connector';connector.hidden=true;connector.setAttribute('aria-hidden','true');
  connector.innerHTML='<svg xmlns="http://www.w3.org/2000/svg"><defs><marker id="tour-arrowhead" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M2 2L10 6L2 10" fill="none" stroke="#16785f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs><path class="tour-link-outline"/><path class="tour-link" marker-end="url(#tour-arrowhead)"/></svg>';
  document.body.append(panel,ring,gesture,connector);
  const loaded = () => Boolean(window.pdfEditor?.state.pages.length);
  const current = () => routes[route].steps[index];
  const remember = () => {try {localStorage.setItem(seenKey,'true');} catch {}};
  function clearDescription() {
    if(previousTarget) {if(previousDescription===null) previousTarget.removeAttribute('aria-describedby'); else previousTarget.setAttribute('aria-describedby',previousDescription);}
    previousTarget = null; previousDescription = null;
  }
  function portal(host = document.body) {for(const node of [panel,ring,gesture,connector]) if(node.parentElement !== host) host.append(node);}
  function stop() {
    running=false;paused=false;afterSignature=null;remember();clearDescription();panel.hidden=ring.hidden=gesture.hidden=connector.hidden=true;
    document.body.classList.remove('edo-tour-running');document.body.style.removeProperty('--tour-space');portal();
  }
  function pause() {if(!running)return;paused=true;panel.hidden=ring.hidden=gesture.hidden=connector.hidden=true;document.body.classList.remove('edo-tour-running');}
  function resume() {if(!running)return;paused=false;document.body.classList.add('edo-tour-running');render(true);}
  function start() {
    if(document.querySelector('dialog[open]')) return;
    running=true;paused=false;index=0;textId=imageId=null;writing=false;document.body.classList.add('edo-tour-running');enter(loaded()?1:0);
  }
  function enter(next) {
    const list=routes[route].steps;index=Math.max(0,Math.min(list.length-1,next));
    if(!loaded() && current()!=='open') index=0;
    const tools={textTool:'text',correctTool:'correct',imageTool:'image'};
    if(tools[current()] && window.pdfEditor?.state.tool===tools[current()]) index++;
    render(true);
  }
  function advance() {enter(index+1);}
  function goTo(id) {const at=routes[route].steps.indexOf(id);if(at>=0) enter(at);}
  function skip() {
    const list=routes[route].steps, group=definitions[current()].group;
    let next=index+1;while(next<list.length && definitions[list[next]].group===group) next++;
    const signature=document.querySelector('.signature-dialog[open]');
    if(signature) {afterSignature=next;signature.querySelector('[data-action="cancel"]').click();return;}
    enter(next);
  }
  function target() {
    const id=current(), item=definitions[id];
    if((id==='textWrite'||id==='correctWrite') && (writing || id==='correctWrite')) return $('inline-done');
    const selector=typeof item.selector==='function'?item.selector():item.selector;
    return document.querySelector(selector);
  }
  function rectOf(node) {
    let r=node.getBoundingClientRect();
    if(node.id==='paper') {
      const viewer=$('viewer').getBoundingClientRect(), top=Math.max(r.top,viewer.top+20,12), left=Math.max(r.left,viewer.left+12);
      const bottom=Math.min(r.bottom,viewer.bottom-20,parseFloat(panel.style.top)||innerHeight);
      const width=Math.min(180,r.right-left-12),height=Math.min(82,bottom-top-20);
      r={left:left+Math.max(0,(Math.min(r.right,viewer.right)-left-width)/2),top:top+Math.max(0,(bottom-top-height)/2),width:Math.max(20,width),height:Math.max(20,height)};
      r.right=r.left+r.width;r.bottom=r.top+r.height;
    }
    return r;
  }
  function layout() {
    frame=0;if(!running||paused)return;
    panel.hidden=false;
    const view=window.visualViewport, vx=view?.offsetLeft||0,vy=view?.offsetTop||0,vw=view?.width||innerWidth,vh=view?.height||innerHeight;
    panel.style.width=`${Math.min(350,vw-16)}px`;panel.style.maxHeight=`${Math.max(110,vh*.47)}px`;
    const height=panel.getBoundingClientRect().height;
    const inSignature=Boolean(document.querySelector('.signature-dialog[open]'));
    $('guide-route').disabled=!$('inline-editor').hidden||inSignature;
    $('guide-next').textContent=inSignature?'Salta la firma':'Salta questo argomento';
    $('guide-next').title=inSignature?'Chiude la foto senza inserirla e prosegue con la guida.':'';
    document.body.style.setProperty('--tour-space',`${height+20}px`);document.body.style.setProperty('--tour-view-height',`${vh}px`);
    panel.style.top=`${vy+vh-height-8}px`;
    const node=target();let r=node&&!node.hidden?rectOf(node):null;
    const panelWidth=panel.getBoundingClientRect().width;
    let left=vx+vw-panelWidth-8;
    if(vw>760&&r&&r.right>left&&r.bottom>vy+vh-height-18) left=vx+8;
    panel.style.left=`${left}px`;
    if(current()==='open'&&r){
      panel.style.left=`${vx+(vw-panelWidth)/2}px`;
      panel.style.top=`${Math.min(vy+vh-height-8,Math.max(vy+(vh-height)/2,r.bottom+38))}px`;
    }
    if(node!==previousTarget) {clearDescription();if(node){previousTarget=node;previousDescription=node.getAttribute('aria-describedby');node.setAttribute('aria-describedby',[previousDescription,'guide-body'].filter(Boolean).join(' '));}}
    const id=current();
    if(!r || id==='finish' || r.bottom<vy || r.top>vy+vh || r.right<vx || r.left>vx+vw) {ring.hidden=gesture.hidden=connector.hidden=true;return;}
    const clip=node.closest('dialog[open]')?.getBoundingClientRect();
    const x=Math.max(vx+3,r.left-5), y=Math.max(vy+3,clip?clip.top+2:vy+3,r.top-5);
    const right=Math.min(vx+vw-3,r.right+5),bottom=Math.min(vy+vh-3,clip?clip.bottom-2:vy+vh-3,r.bottom+5);
    if(right<=x||bottom<=y) {ring.hidden=gesture.hidden=connector.hidden=true;return;}
    ring.hidden=false;Object.assign(ring.style,{left:`${x}px`,top:`${y}px`,width:`${right-x}px`,height:`${bottom-y}px`});
    const mode=definitions[id].gesture;
    ring.dataset.gesture=mode||'';ring.dataset.labelBelow=String(y<42);
    connector.hidden=Boolean(mode);
    if(!mode){
      const c=panel.getBoundingClientRect(),tx=(x+right)/2,ty=(y+bottom)/2,cx=c.left+c.width/2,cy=c.top+c.height/2;
      let sx=cx,sy=cy,ex=tx,ey=ty;
      if(bottom<c.top){sy=c.top-3;ey=bottom+9;}else if(y>c.bottom){sy=c.bottom+3;ey=y-9;}else if(right<c.left){sx=c.left-3;ex=right+9;}else{sx=c.right+3;ex=x-9;}
      const d=`M ${sx} ${sy} C ${sx} ${(sy+ey)/2}, ${ex} ${(sy+ey)/2}, ${ex} ${ey}`;
      for(const path of connector.querySelectorAll('svg > path'))if(path.getAttribute('d')!==d)path.setAttribute('d',d);
    }
    gesture.hidden=!mode;gesture.dataset.mode=mode||'';
    if(mode) Object.assign(gesture.style,{left:`${x+Math.max(0,(right-x-130)/2)}px`,top:`${y+Math.max(0,(bottom-y-65)/2)}px`,width:`${Math.min(150,right-x)}px`,height:`${Math.min(75,bottom-y)}px`});
  }
  function schedule() {if(running&&!paused&&!frame)frame=requestAnimationFrame(layout);}
  function showTarget() {
    if(!running||paused)return;
    const node=target();if(!node)return;
    const editing=document.activeElement===$('inline-text')&&['textWrite','correctWrite'].includes(current());
    if(!editing || node.id==='inline-done') {
      if(node.id==='paper') {$('viewer').scrollIntoView({block:'center',behavior:'instant'});}
      else node.scrollIntoView({block:'center',behavior:'instant'});
      layout();
      if(!node.closest('dialog[open]')) {
        const r=rectOf(node), limit=parseFloat(panel.style.top)-14;
        if(r.bottom>limit) window.scrollBy(0,r.bottom-limit);
      }
    }
    schedule();
  }
  function render(scroll=false) {
    if(!running||paused)return;
    const id=current(),item=definitions[id];panel.dataset.step=id;panel.hidden=false;
    panel.classList.toggle('tour-writing',id==='textWrite'||id==='correctWrite');
    $('guide-title').textContent=item.title;
    $('guide-body').textContent=((id==='textWrite'||id==='correctWrite')&&writing)?'Il testo è pronto. Premi “Fatto” nel riquadro evidenziato per confermarlo.':item.text;
    $('guide-progress').textContent=`${index+1} / ${routes[route].steps.length}`;
    $('guide-route').value=route;$('guide-route').disabled=!$('inline-editor').hidden||Boolean(document.querySelector('.signature-dialog[open]'));
    $('guide-next').hidden=id==='open'||id==='finish';$('guide-show').hidden=id==='finish';
    $('guide-demo').hidden=loaded()||id!=='open';$('guide-finish').hidden=id!=='finish';
    $('guide-install').hidden=id!=='finish'||window.edoInstall?.installed();
    $('guide-details').hidden=id!=='finish';
    layout();if(scroll)requestAnimationFrame(showTarget);
  }
  window.addEventListener('edo:action', event => {
    if(!running||paused)return;
    const action=event.detail, id=current();
    if(action.type==='signature-opened') {portal(document.querySelector('.signature-dialog[open]'));if(definitions[id].group==='image')goTo('imageCrop');else render(false);return;}
    if(action.type==='signature-closed') {portal();if(afterSignature!==null){const next=afterSignature;afterSignature=null;enter(next);}else if(action.cancelled&&definitions[id].group==='image')goTo('imagePlace');else schedule();return;}
    if(action.type==='document-opened') {textId=imageId=null;enter(1);return;}
    if(action.type==='ready') {render(false);return;}
    if(action.type==='tool-selected') {
      if((id==='textTool'&&action.tool==='text')||(id==='correctTool'&&action.tool==='correct')||(id==='imageTool'&&action.tool==='image'))advance();
      const expected={textDraw:'text',correctDraw:'correct',imagePlace:'image'};
      if(expected[id]&&action.tool!==expected[id])goTo(id==='textDraw'?'textTool':id==='correctDraw'?'correctTool':'imageTool');
    }
    if(action.type==='inline-opened') {
      writing=Boolean($('inline-text').value.trim());
      if(action.elementType==='text'&&definitions[id].group==='text')goTo('textWrite');
      if(action.elementType==='correct'&&definitions[id].group==='correct')goTo('correctWrite');
    }
    if(action.type==='inline-cancelled') {writing=false;if(id==='textWrite')goTo('textTool');if(id==='correctWrite')goTo('correctTool');}
    if(action.type==='text-confirmed') {
      writing=false;
      if(action.elementType==='text'&&definitions[id].group==='text') {textId=action.id;goTo('move');}
      if(action.elementType==='correct'&&definitions[id].group==='correct')advance();
    }
    if(action.type==='element-moved'&&id==='move'&&action.id===textId)advance();
    if(action.type==='signature-cropped'&&id==='imageCrop')advance();
    if(action.type==='element-added'&&action.elementType==='image'&&definitions[id].group==='image') {imageId=action.id;goTo('imageResize');}
    if(action.type==='element-resized'&&id==='imageResize'&&action.id===imageId)advance();
    if(action.type==='page-rotated'&&id==='rotate')advance();
    if(action.type==='undo'&&id==='undo')advance();
    else if(action.type==='undo'&&id==='move'&&!document.querySelector(`[data-id="${CSS.escape(textId||'')}"]`))goTo('textTool');
    if(action.type==='pdf-exported'&&id==='download')advance();
    if(action.type==='project-saved'&&id==='project')advance();
    schedule();
  });
  $('inline-text').addEventListener('input',()=>{if(running&&['textWrite','correctWrite'].includes(current())){const value=Boolean($('inline-text').value.trim());if(value!==writing){writing=value;render(writing);}}});
  panel.addEventListener('pointerdown',e=>{if(!$('inline-editor').hidden&&e.target.closest('button')){preserveDraft=true;e.preventDefault();}});
  panel.addEventListener('click',()=>requestAnimationFrame(()=>{preserveDraft=false;}));
  panel.addEventListener('pointercancel',()=>{preserveDraft=false;});
  $('guide-skip').onclick=$('guide-finish').onclick=stop;
  $('guide-show').onclick=showTarget;$('guide-next').onclick=skip;
  $('guide-demo').onclick=()=>{if(!loaded())$('demo').click();};
  $('guide-install').onclick=()=>window.edoInstall?.open();
  $('guide-details').onclick=()=>{stop();$('info-dialog').showModal();};
  $('guide-route').onchange=e=>{route=e.target.value;textId=imageId=null;writing=false;enter(loaded()?1:0);};
  $('help').onclick=()=>running?showTarget():start();
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&running&&!document.querySelector('dialog[open]')&&!e.target.matches('input,textarea,select')){e.preventDefault();stop();}});
  const resized=()=>{schedule();if(running&&!paused&&!window.pdfEditor?.state.drag)requestAnimationFrame(showTarget);};
  window.addEventListener('scroll',schedule,true);window.addEventListener('resize',resized);
  window.visualViewport?.addEventListener('resize',resized);window.visualViewport?.addEventListener('scroll',schedule);
  new ResizeObserver(schedule).observe(panel);
  new MutationObserver(schedule).observe($('layer'),{childList:true});
  window.edoTour={start,stop,pause,resume,active:()=>running,preservingDraft:()=>preserveDraft};
  let seen=false;try{seen=localStorage.getItem(seenKey)==='true';}catch{}
  if(!seen&&location.protocol!=='file:')requestAnimationFrame(()=>{if($('busy').hidden&&!document.querySelector('dialog[open]'))start();});
})();
