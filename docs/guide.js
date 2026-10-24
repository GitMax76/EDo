(() => {
  const $ = id => document.getElementById(id);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let installEvent = null, installed = standalone();
  const platforms = {
    ios: {name: 'iPhone / iPad', steps: ['Apri E.Do. in Safari. Se arrivi da WhatsApp o da un’altra app, apri il link nel browser.', 'Tocca Condividi (il quadrato con la freccia verso l’alto). In alcune versioni si trova nel menu della pagina.', 'Scegli “Aggiungi alla schermata Home”. Se non la trovi, scorri l’elenco; puoi aggiungerla da “Modifica azioni”.', 'Lascia attivo “Apri come app web”, se presente, poi tocca “Aggiungi”. Ritroverai l’icona E.Do. nella Home.']},
    android: {name: 'Android', steps: ['Apri E.Do. in Chrome o in un browser compatibile.', 'Apri il menu del browser (di solito i tre puntini in alto).', 'Scegli “Installa app” oppure “Aggiungi a schermata Home”. La voce può cambiare in base al browser.', 'Conferma e apri E.Do. dalla nuova icona. Se compare il pulsante “Installa E.Do.” qui sotto, puoi usarlo direttamente.']},
    desktop: {name: 'Computer', steps: ['Apri E.Do. in Chrome, Edge o Safari.', 'In Chrome o Edge cerca l’icona di installazione nella barra degli indirizzi, oppure la voce per installare la pagina nel menu del browser.', 'Su Mac, in Safari, usa File → Aggiungi al Dock.', 'Conferma il nome E.Do. Se il browser non offre l’installazione, puoi conservare il sito tra i preferiti.']}
  };
  const detectedPlatform = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'desktop';
  const install = document.createElement('dialog'); install.id = 'install-dialog'; install.className = 'edo-guide'; install.setAttribute('aria-labelledby', 'install-title');
  install.innerHTML = `<h2 id="install-title">Aggiungi E.Do. alla Home</h2><p>Un’icona per aprirlo più velocemente, come un’app.</p><div class="install-platforms" role="group" aria-label="Scegli il dispositivo">${Object.entries(platforms).map(([id,p])=>`<button type="button" data-platform="${id}" aria-pressed="false">${p.name}</button>`).join('')}</div><ol id="install-steps"></ol><p id="install-note" role="status"></p><button type="button" id="install-native" class="primary full" hidden>Installa E.Do.</button><p class="guide-tip">Per aprire E.Do. serve la connessione Internet. I tuoi PDF continuano a essere elaborati sul dispositivo.</p><button type="button" id="install-close" class="full">Ho capito</button>`;
  document.body.append(install);
  let returnToTour = false;
  function platform(id) {
    const list = $('install-steps'); list.replaceChildren();
    for (const text of platforms[id].steps) {const li = document.createElement('li'); li.textContent = text; list.append(li);}
    for (const b of install.querySelectorAll('[data-platform]')) b.setAttribute('aria-pressed', String(b.dataset.platform === id));
    $('install-native').hidden = !installEvent || installed || id === 'ios';
  }
  function openInstall() {
    if (install.open || document.querySelector('dialog[open]')) return;
    returnToTour = Boolean(window.edoTour?.active());
    if (returnToTour) window.edoTour.pause();
    $('install-note').textContent = installed ? 'E.Do. risulta già aperto o installato come app.' : '';
    platform(detectedPlatform()); install.showModal();
  }
  function closeInstall() {install.close(); if (returnToTour) {returnToTour = false; window.edoTour?.resume();}}
  function syncInstalled() {
    installed = standalone() || installed;
    for (const id of ['add-home', 'welcome-install']) $(id).hidden = installed;
    $('install-native').hidden = installed || !installEvent;
  }
  $('add-home').onclick = $('welcome-install').onclick = openInstall;
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
    if (install.open) $('install-native').hidden = installed || install.querySelector('[data-platform="ios"]').getAttribute('aria-pressed') === 'true';
  });
  window.addEventListener('appinstalled', () => {installed = true; installEvent = null; syncInstalled(); $('install-note').textContent = 'E.Do. è stato aggiunto alle tue app.';});
  window.matchMedia('(display-mode: standalone)').addEventListener('change', syncInstalled);
  syncInstalled();
  window.edoInstall = {open: openInstall, installed: () => installed};
})();
