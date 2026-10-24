(() => {
  const $ = id => document.getElementById(id);
  const seenKey = 'edo-guide-v1-seen';
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let installEvent = null, step = 0, returnToGuide = false, installed = standalone();
  const platforms = {
    ios: {name: 'iPhone / iPad', steps: ['Apri E.Do. in Safari. Se arrivi da WhatsApp o da un’altra app, apri il link nel browser.', 'Tocca Condividi (il quadrato con la freccia verso l’alto). In alcune versioni si trova nel menu della pagina.', 'Scegli “Aggiungi alla schermata Home”. Se non la trovi, scorri l’elenco; puoi aggiungerla da “Modifica azioni”.', 'Lascia attivo “Apri come app web”, se presente, poi tocca “Aggiungi”. Ritroverai l’icona E.Do. nella Home.']},
    android: {name: 'Android', steps: ['Apri E.Do. in Chrome o in un browser compatibile.', 'Apri il menu del browser (di solito i tre puntini in alto).', 'Scegli “Installa app” oppure “Aggiungi a schermata Home”. La voce può cambiare in base al browser.', 'Conferma e apri E.Do. dalla nuova icona. Se compare il pulsante “Installa E.Do.” qui sotto, puoi usarlo direttamente.']},
    desktop: {name: 'Computer', steps: ['Apri E.Do. in Chrome, Edge o Safari.', 'In Chrome o Edge cerca l’icona di installazione nella barra degli indirizzi, oppure la voce per installare la pagina nel menu del browser.', 'Su Mac, in Safari, usa File → Aggiungi al Dock.', 'Conferma il nome E.Do. Se il browser non offre l’installazione, puoi conservare il sito tra i preferiti.']}
  };
  const detectedPlatform = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'desktop';
  const steps = [
    {title: 'Apri il tuo PDF', badge: 'APRI', icon: '↥', body: 'Premi “Apri PDF” e scegli il documento dal telefono o dal computer. Per prendere confidenza puoi provare un esempio.', tip: 'I documenti vengono elaborati sul tuo dispositivo. Non serve un account.', target: 'Apri PDF'},
    {title: 'Scrivi e correggi', badge: 'MODIFICA', icon: 'T', body: 'Con “Scrivi testo” trascina un riquadro sulla pagina e scrivi al suo interno. Con “Bianchetto” copri una parte da correggere e scrivi sopra.', tip: 'Premi “Fatto” per confermare. “Annulla” ti permette di tornare indietro.', target: 'Scrivi testo · Bianchetto'},
    {title: 'Inserisci la tua firma', badge: 'FIRMA', icon: '✎', body: 'Scegli “Immagine o firma”, tocca la pagina e seleziona la foto. Ritaglia con i pallini verdi, regola lo sfondo e cancella i residui con la gomma.', tip: 'Controlla che resti soltanto la firma. Una firma come immagine non è una firma digitale certificata.', target: 'Immagine o firma'},
    {title: 'Sposta e sistema', badge: 'SISTEMA', icon: '↔', body: 'Con “Sposta gli elementi” trascina le tue aggiunte. L’angolo in basso a destra serve per ridimensionarle. Puoi anche ruotare, spostare, eliminare e unire pagine.', tip: 'Il doppio clic su un testo che hai aggiunto ti permette di riscriverlo.', target: 'Sposta gli elementi'},
    {title: 'Scarica o continua più tardi', badge: 'SALVA', icon: '↓', body: '“Scarica PDF” crea il documento da usare o inviare. Con “Salva progetto” conservi invece le aggiunte modificabili; le ritrovi usando “Apri progetto”.', tip: 'Nel PDF scaricato, le pagine modificate diventano immagini e il loro testo non è selezionabile. Il progetto conserva anche il PDF originale: tienilo per te.', target: 'Scarica PDF · Salva progetto'},
    {title: 'E.Do. a portata di mano', badge: 'PRONTO', icon: '⌂', body: 'Aggiungi E.Do. alla schermata Home del telefono o tra le app del computer, per ritrovarlo facilmente.', tip: 'Puoi riaprire questa guida in qualsiasi momento da “Come funziona”.', target: 'Aggiungi alla Home'}
  ];
  const guide = document.createElement('dialog'); guide.id = 'guide-dialog'; guide.className = 'edo-guide'; guide.setAttribute('aria-labelledby', 'guide-title');
  guide.innerHTML = `<div class="guide-top"><span id="guide-progress"></span><button type="button" id="guide-skip" class="quiet">Salta guida</button></div>
    <div id="guide-content" aria-live="polite" aria-atomic="true"><div class="guide-visual" aria-hidden="true"><div class="guide-sheet"><span id="guide-icon"></span><i></i><i></i><b id="guide-badge"></b></div></div>
    <h2 id="guide-title" tabindex="-1"></h2><p id="guide-body"></p><div id="guide-target" class="guide-target"></div><p id="guide-tip" class="guide-tip"></p></div>
    <div id="guide-last" hidden><button type="button" id="guide-install">Aggiungi alla Home</button><button type="button" id="guide-demo">Prova con un esempio</button><button type="button" id="guide-details" class="link">Tutte le istruzioni</button></div>
    <div class="guide-navigation"><button type="button" id="guide-back">Indietro</button><button type="button" id="guide-next" class="primary">Avanti</button></div>`;
  const install = document.createElement('dialog'); install.id = 'install-dialog'; install.className = 'edo-guide'; install.setAttribute('aria-labelledby', 'install-title');
  install.innerHTML = `<h2 id="install-title">Aggiungi E.Do. alla Home</h2><p>Un’icona per aprirlo più velocemente, come un’app.</p><div class="install-platforms" role="group" aria-label="Scegli il dispositivo">${Object.entries(platforms).map(([id,p])=>`<button type="button" data-platform="${id}" aria-pressed="false">${p.name}</button>`).join('')}</div><ol id="install-steps"></ol><p id="install-note" role="status"></p><button type="button" id="install-native" class="primary full" hidden>Installa E.Do.</button><p class="guide-tip">Per aprire E.Do. serve la connessione Internet. I tuoi PDF continuano a essere elaborati sul dispositivo.</p><button type="button" id="install-close" class="full">Ho capito</button>`;
  document.body.append(guide, install);
  const remember = () => { try {localStorage.setItem(seenKey, 'true');} catch {} };
  function finish() {remember(); guide.close();}
  function render(focus = false) {
    const item = steps[step];
    $('guide-progress').textContent = `Passaggio ${step + 1} di ${steps.length}`;
    for (const [id, value] of Object.entries({'guide-title': item.title, 'guide-body': item.body, 'guide-tip': item.tip, 'guide-target': item.target, 'guide-icon': item.icon, 'guide-badge': item.badge})) $(id).textContent = value;
    $('guide-back').disabled = step === 0;
    $('guide-next').textContent = step === steps.length - 1 ? 'Inizia a usare E.Do.' : 'Avanti';
    $('guide-last').hidden = step !== steps.length - 1;
    $('guide-demo').hidden = document.body.classList.contains('has-document');
    $('guide-install').hidden = installed;
    if (installed && step === steps.length - 1) $('guide-body').textContent = 'Stai già usando E.Do. come app. Apri un PDF e scegli lo strumento che ti serve.';
    guide.scrollTop = 0; if (focus) $('guide-title').focus({preventScroll: true});
  }
  function openTutorial() {
    if (guide.open || document.querySelector('dialog[open]')) return;
    step = 0; render(); guide.showModal(); $('guide-title').focus({preventScroll: true});
  }
  function platform(id) {
    const list = $('install-steps'); list.replaceChildren();
    for (const text of platforms[id].steps) {const li = document.createElement('li'); li.textContent = text; list.append(li);}
    for (const b of install.querySelectorAll('[data-platform]')) b.setAttribute('aria-pressed', String(b.dataset.platform === id));
    $('install-native').hidden = !installEvent || installed || id === 'ios';
  }
  function openInstall() {
    if (install.open) return;
    returnToGuide = guide.open;
    if (guide.open) guide.close();
    else if (document.querySelector('dialog[open]')) return;
    $('install-note').textContent = installed ? 'E.Do. risulta già aperto o installato come app.' : '';
    platform(detectedPlatform()); install.showModal();
  }
  function closeInstall() {install.close(); if (returnToGuide) {returnToGuide = false; render(); guide.showModal(); $('guide-title').focus({preventScroll: true});}}
  function syncInstalled() {
    installed = standalone() || installed;
    for (const id of ['add-home', 'welcome-install', 'guide-install']) $(id).hidden = installed;
    $('install-native').hidden = installed || !installEvent;
  }
  $('guide-skip').onclick = finish;
  guide.oncancel = e => {e.preventDefault(); finish();};
  $('guide-next').onclick = () => {if (step === steps.length - 1) finish(); else {step++; render(true);}};
  $('guide-back').onclick = () => {step = Math.max(0, step - 1); render(true);};
  $('guide-demo').onclick = () => {finish(); $('demo').click();};
  $('guide-details').onclick = () => {finish(); $('info-dialog').showModal();};
  $('guide-install').onclick = openInstall;
  $('add-home').onclick = $('welcome-install').onclick = openInstall;
  $('help').onclick = openTutorial;
  for (const b of install.querySelectorAll('[data-platform]')) b.onclick = () => platform(b.dataset.platform);
  $('install-close').onclick = closeInstall;
  install.oncancel = e => {e.preventDefault(); closeInstall();};
  $('install-native').onclick = async () => {
    const event = installEvent; if (!event) return;
    installEvent = null; $('install-native').hidden = true;
    try {
      await event.prompt(); const choice = await event.userChoice;
      if (choice.outcome === 'accepted') {installed = true; syncInstalled(); $('install-note').textContent = 'Richiesta di installazione accettata. Il browser completerà l’operazione.';}
      else $('install-note').textContent = 'Puoi aggiungere E.Do. più tardi dal menu del browser.';
    } catch {$('install-note').textContent = 'Usa le istruzioni qui sopra per aggiungere E.Do. dal menu del browser.';}
  };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installEvent = event;
    if (install.open) {$('install-native').hidden = installed || install.querySelector('[data-platform="ios"]').getAttribute('aria-pressed') === 'true';}
  });
  window.addEventListener('appinstalled', () => {installed = true; installEvent = null; syncInstalled(); $('install-note').textContent = 'E.Do. è stato aggiunto alle tue app.';});
  window.matchMedia('(display-mode: standalone)').addEventListener('change', syncInstalled);
  syncInstalled();
  let seen = false; try {seen = localStorage.getItem(seenKey) === 'true';} catch {}
  if (!seen && location.protocol !== 'file:') requestAnimationFrame(() => {if (!document.body.classList.contains('has-document') && $('busy').hidden) openTutorial();});
})();
