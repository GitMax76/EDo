# Feedback senza account GitHub

## Installazione

1. Creare il Worker `edofa-feedback`.
2. Aggiungere un database D1 `edofa-feedback-db` con binding **DB**.
3. In **Edit code**, sostituire l'intero script con il contenuto di `worker.mjs` e premere **Deploy**.
4. Aprire `https://edofa-feedback.massi-sabato.workers.dev/health`: deve rispondere con `"ready":true`.
5. Collegare il modulo dell'app solo dopo la verifica del servizio. Il frontend attuale continua a usare GitHub finche questa integrazione non viene attivata.

Le tabelle si creano automaticamente al primo feedback valido. Il controllo health verifica il binding D1 senza inserire un feedback.

## Lettura dei messaggi

I messaggi sono privati nel proprio account Cloudflare: **Storage & databases > D1 > edofa-feedback-db > Studio**, tabella **feedback**. Per i messaggi piu recenti:

```sql
SELECT created_at, kind, title, message, status FROM feedback ORDER BY created_at DESC;
```

Non esistono endpoint pubblici per leggere i messaggi. Non vengono inviate notifiche email e non vengono create issue GitHub automaticamente.

## Limite e dati conservati

- Due feedback per indirizzo IP e mese di calendario in **Europe/Rome**. Chi condivide la stessa rete puo condividere il limite. VPN, reti diverse e indirizzi dinamici impediscono una garanzia di due invii per persona.
- Il conteggio e l'inserimento sono eseguiti da una singola istruzione SQLite per evitare superamenti con richieste simultanee.
- Si conservano titolo, descrizione, tipo, data, stato e identificatore mensile della rete ottenuto con HMAC. L'IP originale non viene salvato nelle tabelle del servizio; Cloudflare tratta comunque le richieste secondo le proprie impostazioni e condizioni.
- La chiave HMAC privata viene generata e conservata nel database. Non renderla pubblica e non modificarla senza considerare il reset dei limiti.
- Nessun PDF, allegato, indirizzo MAC o account GitHub viene richiesto.
- Il filtro iniziale comprende limite server, dimensione massima, validazione e campo esca. **Turnstile non e ancora integrato**; il controllo Origin da solo non ferma un client non browser.
- Eliminare un messaggio dal database riduce anche il conteggio di quel mese. Per archiviarlo senza modificare il limite, cambiare il campo `status`.

Il servizio non pubblica una pagina amministrativa. Conservare i feedback solo per il tempo necessario e aggiornare il testo informativo del modulo prima di attivarlo.
