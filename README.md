# E.Do.-Fa — Editor Documenti Facile

Prima versione web **0.7.0-beta**: apri un PDF, trascina una zona e scrivi direttamente al suo interno. I documenti sono elaborati nel browser e non vengono caricati nell'applicazione o nella repository.

## Apri l'app

Indirizzo GitHub Pages: **https://gitmax76.github.io/EDo/**, operativo dopo l’attivazione di Pages e la prima pubblicazione completata.

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

Il modulo dell'app invia messaggi privati al Worker Cloudflare `edofa-feedback.massi-sabato.workers.dev`. Non serve un account GitHub. Si trasmettono solo tipo, titolo, descrizione e identificatore casuale della richiesta, senza PDF o nomi dei documenti.

Il servizio limita a **due feedback per indirizzo IP e mese di calendario Europe/Rome**. Le persone sulla stessa rete possono condividere il limite; VPN e indirizzi dinamici impediscono un'identificazione certa per persona. Nel database si conserva un identificatore mensile della rete ottenuto con HMAC, senza IP in chiaro. Cloudflare tratta comunque le richieste secondo le proprie impostazioni e condizioni.

I messaggi sono consultabili rapidamente nella [pagina privata dei feedback](https://edofa-feedback.massi-sabato.workers.dev/admin), dopo avere aggiornato il Worker. Accesso con la chiave gia salvata in TELEGRAM_BOT_TOKEN, senza chiamate a Telegram. Restano disponibili anche in **Cloudflare > D1 > edofa-feedback-db > Studio > feedback**. Non vengono pubblicati su GitHub e non vengono inviate email. Le notifiche Telegram sono disattivate per impostazione predefinita. Configurazione, limiti e lettura dei messaggi: [cloudflare/README.md](cloudflare/README.md).

La gestione delle issue GitHub resta separata: `.github/workflows/feedback.yml` continua a limitare le issue a due per account al mese, chiudendo quelle in eccesso dopo la creazione. Il modulo pubblico non crea issue.

Il workflow `.github/workflows/pages.yml` verifica il JavaScript, esegue i test del filtro e pubblica solo la cartella `docs`. In **Settings → Pages → Build and deployment**, la sorgente deve essere **GitHub Actions**.

```powershell
node --check docs/app.js
node --check docs/feedback.js
node --test tests/*.test.cjs
python avvia_edofa.py
```

I controlli coprono la quota mensile, il cambio di mese italiano, altri account, pull request, riaperture ed eventi fuori ordine. Le prove non garantiscono la compatibilità con ogni PDF.

## Librerie e privacy

PDF.js 5.4.624 (Apache-2.0) e PDF-LIB 1.17.1 (MIT) sono incluse localmente, con le relative licenze in `docs/vendor`. Non vengono caricate da CDN durante l'uso. Non ci sono analytics dell'app. GitHub gestisce hosting e issue; Cloudflare gestisce il servizio di feedback secondo le rispettive condizioni e informative.

Non caricare PDF personali o progetti JSON in questa repository pubblica.
