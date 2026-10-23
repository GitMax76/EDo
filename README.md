# E.Do.-Fa — Editor Documenti Facile

Prima versione web **0.7.0-beta**: apri un PDF, trascina una zona e scrivi direttamente al suo interno. I documenti sono elaborati nel browser e non vengono caricati nell'applicazione o nella repository.

## Apri l'app

Il sito di questa repository è pubblicato con GitHub Pages: **https://gitmax76.github.io/EDo/**.

Puoi anche scaricare il codice, estrarre tutti i file e fare doppio clic su **AVVIA-EDOFA.cmd**. Per l'avvio locale serve Python 3.10 o successivo, senza installare altre librerie. Non aprire `docs/index.html` con doppio clic: i moduli PDF richiedono HTTP o HTTPS.

## Funzioni

- Testo e correzioni direttamente sulla pagina, senza popup per digitare.
- Immagini e firme PNG/JPEG, spostamento e ridimensionamento delle aggiunte.
- Evidenziazioni e oscuramenti.
- Rotazione, riordino, eliminazione, unione e aggiunta di pagine.
- Interfaccia leggibile e pulsante **Testo più grande**.
- Annullamento, esportazione PDF e progetto modificabile.

## Come scrivere

1. Premi **Apri PDF**.
2. Scegli **Scrivi testo** o **Correggi il PDF**.
3. Trascina per definire l'area e scrivi dentro.
4. Clic fuori o **Fatto** conferma; **Esc** annulla la scrittura in corso.

Con **Sposta gli elementi** trascini le aggiunte. Il doppio clic su un tuo testo lo rende nuovamente scrivibile.

## Esportazione: limite di questa prima versione

Le pagine modificate diventano **immagini** nel PDF scaricato. Il testo di queste pagine non è più selezionabile o ricercabile. Le pagine senza aggiunte conservano il contenuto originale.

Per riprendere gli elementi separati e spostabili, usa **Salva progetto**. Il progetto JSON contiene anche il PDF originale: non condividerlo come copia anonimizzata. Le bande nere rimuovono il contenuto sottostante nel PDF esportato, non nel progetto.

Non sono inclusi OCR, reimpaginazione automatica, firma digitale certificata o modifica completa dei moduli. La correzione del testo usa un font standard e uno sfondo bianco. Controlla il PDF salvato prima di condividerlo, in particolare per documenti complessi, firmati o con sfondi colorati.

## Suggerimenti e feedback

Il comando nell'app prepara una segnalazione che il visitatore può rivedere e inviare su GitHub. **È necessario un account GitHub e il feedback è pubblico.** Nessun PDF viene allegato automaticamente. Non includere dati personali o documenti riservati.

Sono accettate al massimo **due nuove segnalazioni al mese per account GitHub**, secondo il calendario **Europe/Rome**. Il workflow `.github/workflows/feedback.yml` controlla tutte le nuove issue e le riaperture: le segnalazioni oltre il limite vengono chiuse automaticamente **dopo la creazione**, non bloccate prima dell'invio.

Il controllo considera anche le issue già chiuse; chiudere una segnalazione non azzera la quota. Le pull request non contano. Il limite riguarda gli account, non le persone o le macchine: non vengono raccolti IP, MAC o impronte del dispositivo dall'app. Gli account distinti hanno quote distinte. Il mese viene determinato dalla data di creazione dell'issue.

## Pubblicazione e verifiche

Il workflow `.github/workflows/pages.yml` verifica il JavaScript, esegue i test del filtro e pubblica solo la cartella `docs`. In **Settings → Pages → Build and deployment**, la sorgente deve essere **GitHub Actions**.

```powershell
node --check docs/app.js
node --check docs/feedback.js
node --test tests/*.test.cjs
python avvia_edofa.py
```

I controlli coprono la quota mensile, il cambio di mese italiano, altri account, pull request, riaperture ed eventi fuori ordine. Le prove non garantiscono la compatibilità con ogni PDF.

## Librerie e privacy

PDF.js 5.4.624 (Apache-2.0) e PDF-LIB 1.17.1 (MIT) sono incluse localmente, con le relative licenze in `docs/vendor`. Non vengono caricate da CDN durante l'uso. Non ci sono analytics dell'app. GitHub gestisce hosting, autenticazione e feedback secondo le proprie condizioni e informative.

Non caricare PDF personali o progetti JSON in questa repository pubblica.
