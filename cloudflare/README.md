# Feedback senza account GitHub

## Installazione

1. Creare il Worker `edofa-feedback`.
2. Aggiungere un database D1 `edofa-feedback-db` con binding **DB**.
3. In **Edit code**, sostituire l'intero script con il contenuto di `worker.mjs` e premere **Deploy**.
4. Aprire `https://edofa-feedback.massi-sabato.workers.dev/health`: deve rispondere con `"ready":true`.
5. Collegare il modulo dell'app solo dopo la verifica del servizio. Il frontend pubblicato invia il modulo al percorso `/feedback` di questo Worker.

Le tabelle si creano automaticamente al primo feedback valido. Il controllo health verifica il binding D1 senza inserire un feedback.

## Lettura dei messaggi

I messaggi sono privati nel proprio account Cloudflare: **Storage & databases > D1 > edofa-feedback-db > Studio**, tabella **feedback**. Per i messaggi piu recenti:

```sql
SELECT created_at, kind, title, message, status FROM feedback ORDER BY created_at DESC;
```

Non esistono endpoint pubblici per leggere i messaggi. Non vengono inviate notifiche email e non vengono create issue GitHub automaticamente. Telegram puo ricevere i nuovi messaggi dopo il collegamento descritto sotto.

## Limite e dati conservati

- Due feedback per indirizzo IP e mese di calendario in **Europe/Rome**. Chi condivide la stessa rete puo condividere il limite. VPN, reti diverse e indirizzi dinamici impediscono una garanzia di due invii per persona.
- Il conteggio e l'inserimento sono eseguiti da una singola istruzione SQLite per evitare superamenti con richieste simultanee.
- Si conservano titolo, descrizione, tipo, data, stato e identificatore mensile della rete ottenuto con HMAC. L'IP originale non viene salvato nelle tabelle del servizio; Cloudflare tratta comunque le richieste secondo le proprie impostazioni e condizioni.
- La chiave HMAC privata viene generata e conservata nel database. Non renderla pubblica e non modificarla senza considerare il reset dei limiti.
- Nessun PDF, allegato, indirizzo MAC o account GitHub viene richiesto.
- Il filtro iniziale comprende limite server, dimensione massima, validazione e campo esca. **Turnstile non e ancora integrato**; il controllo Origin da solo non ferma un client non browser.
- Eliminare un messaggio dal database riduce anche il conteggio di quel mese. Per archiviarlo senza modificare il limite, cambiare il campo `status`.

Il servizio non pubblica una pagina amministrativa. Conservare i feedback solo per il tempo necessario e aggiornare il testo informativo del modulo prima di attivarlo.

## Collegamento Telegram dal browser

1. Creare un bot dedicato con BotFather e avviare la sua chat privata.
2. In Settings > Variables and Secrets del Worker, salvare `TELEGRAM_BOT_TOKEN` come Secret, solo Production.
3. Nello stesso punto aggiungere `TELEGRAM_SETUP_KEY` come Secret: password casuale riservata da 20 a 200 caratteri. Non usare il token come password. Non pubblicare questi valori.
4. Sostituire lo script del Worker con la versione aggiornata di `worker.mjs` e fare Deploy. I segreti rimangono configurati.
5. Aprire `https://edofa-feedback.massi-sabato.workers.dev/telegram`. Copiare il comando `/collega ...` mostrato e inviarlo nella chat privata con il proprio bot.
6. Inserire la password TELEGRAM_SETUP_KEY nella pagina e premere **Collega la mia chat e invia la conferma**, entro 15 minuti dal messaggio.
7. Il bot invia una conferma nella chat scelta. Il numero della chat rimane privato in D1, tabella feedback_config. Non occorre recuperare manualmente il Chat ID o installare software sul PC.

La pagina rifiuta origini esterne e richiede la password anche per il test di invio. Non collega il primo /start e non sostituisce una chat gia collegata. Se ci sono errori, il codice mostrato nella nuova pagina cambia: inviare al bot il NUOVO comando prima di riprovare. Un bot con webhook gia configurato non puo essere letto con getUpdates: usare un bot dedicato.

Solo i feedback NUOVI ricevuti dopo il collegamento vengono notificati. Titolo, descrizione e tipo passano anche da Telegram; IP e codice di rete non vengono inoltrati. Nessun recupero automatico dei messaggi storici. L'invio usa il tempo di esecuzione in background del Worker, senza rallentare la conferma del salvataggio.

Il database resta la fonte principale: in caso di problemi Telegram il feedback resta salvato. Lo stato degli invii e in `telegram_delivery` (`in_corso`, `inviato`, `errore`). Non e prevista una ritrasmissione automatica; in caso di errore leggere il messaggio in D1. La funzione **Invia prova su Telegram** non consuma la quota dei feedback.
