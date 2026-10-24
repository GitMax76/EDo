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

## Collegamento Telegram dal browser (versione 3)

1. Creare un bot dedicato con BotFather e avviare la sua chat privata.
2. Salvare il suo token nel segreto `TELEGRAM_BOT_TOKEN` del Worker, in Production.
3. Sostituire lo script del Worker con `worker.mjs` e fare Deploy.
4. Aprire `https://edofa-feedback.massi-sabato.workers.dev/telegram`: deve comparire **Versione 3: accesso con il token di BotFather**.
5. Inviare nella chat privata del bot il comando `/collega ...` mostrato nella pagina.
6. Incollare il token di BotFather nel campo mascherato e premere il pulsante, entro 15 minuti dal messaggio. Il token viene inviato con POST soltanto al proprio Worker HTTPS, confrontato con il segreto gia configurato e non viene restituito nella pagina, scritto nei log dell'app o incluso nell'URL.
7. Attendere la conferma nella propria chat. Il Chat ID resta privato in D1, tabella feedback_config.

Non serve una password aggiuntiva TELEGRAM_SETUP_KEY. I vecchi moduli restano compatibili con quel segreto, ma le nuove pagine usano solo il token. Non condividere token, password o screenshot dei valori. Il codice pubblicato non contiene credenziali.

La verifica **Verifica database e bot** distingue database, token non presente, token errato e webhook. Non modifica la chat e non invia notifiche. Il bot deve essere dedicato e senza webhook di altri servizi.

Il collegamento richiede sia il token configurato sia il comando recente nella chat privata; non collega il primo /start e non sostituisce una chat gia associata. Dopo un errore il codice mostrato cambia: inviare il NUOVO comando prima di riprovare.

Solo i feedback NUOVI vengono notificati. Titolo, descrizione e tipo passano anche da Telegram; IP e codice di rete non vengono inoltrati. Nessun recupero automatico dei messaggi storici.

In caso di errore Telegram il feedback resta nel database. Lo stato degli invii e in `telegram_delivery` (`in_corso`, `inviato`, `errore`). Non e prevista ritrasmissione automatica: leggere eventuali messaggi mancanti in D1. **Invia prova su Telegram** non consuma la quota dei feedback.
