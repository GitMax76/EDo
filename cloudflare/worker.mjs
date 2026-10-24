// E.Do.-Fa feedback service. Cloudflare Worker, D1 binding named DB.
// No PDF uploads, public listing, GitHub account or API token required.
const ORIGIN = 'https://gitmax76.github.io';
const MAX_BYTES = 8192;
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS feedback_config (name TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, month TEXT NOT NULL,
    network_key TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
    message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'nuovo')`,
  `CREATE INDEX IF NOT EXISTS feedback_quota ON feedback(month, network_key)`,
  `CREATE TABLE IF NOT EXISTS telegram_delivery (feedback_id TEXT PRIMARY KEY, state TEXT NOT NULL)`
];
// One atomic statement: concurrent requests cannot race past the quota.
export const INSERT_FEEDBACK = `INSERT OR IGNORE INTO feedback
  (id, created_at, month, network_key, kind, title, message)
  SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
  WHERE (SELECT COUNT(*) FROM feedback WHERE month = ?3 AND network_key = ?4) < 2`;

export function monthInRome(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit'
  }).formatToParts(now);
  return parts.find(p => p.type === 'year').value + '-' + parts.find(p => p.type === 'month').value;
}
function reply(data, status = 200, cors = false) {
  const headers = {'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin'};
  if (cors) Object.assign(headers, {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  return new Response(JSON.stringify(data), {status, headers});
}
export function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const {id, kind} = data;
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '') ||
      !['Suggerimento', 'Problema', 'Altro'].includes(kind) ||
      title.length < 5 || title.length > 100 || message.length < 15 || message.length > 1500) return null;
  return {id, kind, title, message};
}
async function readBody(request, asForm = false) {
  if (!request.body) throw new Error('empty');
  const reader = request.body.getReader();
  const chunks = []; let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {await reader.cancel(); throw new Error('large');}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const body = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) {body.set(chunk, offset); offset += chunk.byteLength;}
  const text = new TextDecoder().decode(body);
  return asForm ? Object.fromEntries(new URLSearchParams(text)) : JSON.parse(text);
}
async function networkKey(db, ip, month) {
  // Create the private HMAC key once, in D1. Never publish it in source code.
  await db.prepare('INSERT OR IGNORE INTO feedback_config(name,value) VALUES (?,?)')
    .bind('ip_hmac_key', crypto.randomUUID() + crypto.randomUUID()).run();
  const row = await db.prepare('SELECT value FROM feedback_config WHERE name = ?')
    .bind('ip_hmac_key').first();
  if (!row?.value) throw new Error('configuration');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(row.value),
    {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(month + '|' + ip));
  return [...new Uint8Array(signature)].map(n => n.toString(16).padStart(2, '0')).join('');
}
function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function setupPage(message = '', status = 200) {
  const command = '/collega ' + crypto.randomUUID();
  const html = `<!doctype html><html lang="it"><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>E.Do.-Fa | Telegram</title>
  <style>body{font:19px/1.6 system-ui;background:#f5f8f3;color:#172b42;margin:0;padding:24px}
  main{max-width:720px;margin:20px auto;background:white;padding:28px;border-radius:20px}
  h1{line-height:1.2;color:#116a54}input,button{font:inherit;padding:14px;box-sizing:border-box;width:100%;margin:10px 0;border-radius:8px;border:1px solid #9ab4a8}
  button{background:#116a54;color:white;font-weight:700;cursor:pointer}code{display:block;overflow-wrap:anywhere;background:#edf5ee;padding:12px;user-select:all}
  .notice{padding:14px;background:#fff3da;border-radius:10px}a{color:#116a54}</style>
  <main><h1>Collega la tua chat Telegram</h1>
  ${message ? '<p class="notice" role="status">'+escapeHTML(message)+'</p>' : ''}
  <p>Configurazione del proprietario. Versione 4: copia da BotFather assistita. Non serve creare un'altra password.</p>
  <ol><li>Tieni a portata di mano il token ricevuto da BotFather, gia salvato nel segreto TELEGRAM_BOT_TOKEN del tuo Worker.</li>
  <li>Apri la chat privata con il tuo bot e inviagli questo messaggio (puoi selezionarlo e copiarlo):<code>${command}</code></li>
  <li>Entro 15 minuti, incolla qui sotto il token di BotFather e premi il pulsante. Viene inviato solo a questo Worker Cloudflare tramite HTTPS, mai nell'indirizzo della pagina.</li></ol>
  <form action="/telegram/connect" method="post"><input type="hidden" name="auth" value="token">
  <input type="hidden" name="command" value="${command}">
  <label for="key">Token del bot ricevuto da BotFather</label>
  <input id="key" name="key" type="password" required minlength="20" maxlength="200" autocomplete="off">
  <button>Collega la mia chat e invia la conferma</button></form>
  <details><summary>Il collegamento non riesce? Verifica la configurazione</summary>
  <form action="/telegram/check" method="post"><input type="hidden" name="auth" value="token"><label for="checkkey">Token del bot ricevuto da BotFather</label>
  <input id="checkkey" name="key" type="password" required minlength="20" maxlength="200" autocomplete="off"><button>Verifica database e bot</button></form></details>
  <details><summary>La chat e gia collegata? Invia un messaggio di prova</summary>
  <form action="/telegram/test" method="post"><input type="hidden" name="auth" value="token"><label for="testkey">Token del bot ricevuto da BotFather</label>
  <input id="testkey" name="key" type="password" required minlength="20" maxlength="200" autocomplete="off"><button>Invia prova su Telegram</button></form></details>
  <p>Il comando /collega non e il token. Il collegamento richiede entrambi e accetta solo chat private. Non modifica il limite mensile dei feedback.</p>
  <a href="https://gitmax76.github.io/EDo/">Torna a E.Do.-Fa</a></main></html>`;
  return new Response(html, {status, headers: {'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
async function validSetupKey(input, secret) {
  if (typeof secret !== 'string' || secret.length < 20 || secret.length > 200 ||
      typeof input !== 'string' || input.length > 200) return false;
  const enc = new TextEncoder();
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(input)));
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(secret)));
  let different = 0; for (let i=0;i<a.length;i++) different |= a[i]^b[i];
  return different === 0;
}
export function normalizeBotToken(value) {
  if (typeof value !== 'string' || value.length > 8192) return '';
  // Recover a single unambiguous token from quotes, copied BotFather messages,
  // environment assignments or an official API URL. Never change token letters.
  const clean = value.replace(/[\u200b-\u200f\u2060\ufeff]/g,'').replace(/\uff1a/g,':').trim();
  const matches = [...clean.matchAll(/(?:^|[^A-Za-z0-9_-])(?:bot)?([0-9]+:[A-Za-z0-9_-]+)(?=$|[^A-Za-z0-9_-])/g)];
  const tokens = [...new Set(matches.map(match => match[1]))];
  return tokens.length === 1 ? tokens[0] : '';
}
export async function authorizeTelegramSetup(data, env) {
  const stored = normalizeBotToken(env.TELEGRAM_BOT_TOKEN);
  const supplied = normalizeBotToken(data.key);
  // Compatibility for old forms only; the new page uses token authentication.
  if (data.auth !== 'token' && await validSetupKey(data.key, env.TELEGRAM_SETUP_KEY)) return {ok:true};
  if (!env.TELEGRAM_BOT_TOKEN) return {ok:false,message:'In questo Worker manca TELEGRAM_BOT_TOKEN. Aggiungi quel segreto in Production con il token di BotFather.'};
  if (!stored) return {ok:false,message:'Il valore salvato in Cloudflare non contiene un singolo token riconoscibile, anche dopo la pulizia della copia. Non e ancora stato contattato Telegram. Serve controllare il valore del segreto TELEGRAM_BOT_TOKEN nell account e nel Worker corretti.'};
  if (!supplied) return {ok:false,message:'Qui va il token di BotFather (numeri, due punti e lettere), non la password TELEGRAM_SETUP_KEY. Puoi incollare anche il messaggio di BotFather contenente una sola chiave.'};
  if (!await validSetupKey(supplied,stored)) return {ok:false,message:'Il token incollato e diverso da quello salvato in TELEGRAM_BOT_TOKEN su Cloudflare. Copia la stessa chiave attuale di BotFather nei due punti.'};
  return {ok:true};
}
class TelegramError extends Error {}
export async function telegramCall(token, method, data, send = fetch) {
  if (!token) throw new TelegramError('Manca il segreto TELEGRAM_BOT_TOKEN in Production.');
  token = normalizeBotToken(token);
  if (!/^[0-9]+:[A-Za-z0-9_-]+$/.test(token)) throw new TelegramError('Formato del token non valido. In TELEGRAM_BOT_TOKEN inserisci solo la chiave di BotFather, senza virgolette o testo aggiuntivo.');
  // The token is used only server-side with the official Telegram API.
  let res;
  try {res = await send('https://api.telegram.org/bot'+token+'/'+method, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data),
    signal:AbortSignal.timeout(10000), redirect:'error'
  });} catch {throw new TelegramError('Connessione a Telegram non riuscita o scaduta. Riprova tra poco.');}
  let result;
  try {result = await res.json();} catch {throw new TelegramError('Telegram ha restituito una risposta non valida. Riprova tra poco.');}
  if (!res.ok || result.ok !== true) {
    const code = result.error_code || res.status;
    const messages = {
      401:'Telegram rifiuta il token (401). Controlla che TELEGRAM_BOT_TOKEN contenga la chiave attuale del tuo bot.',
      404:'Token o indirizzo del bot non valido (404). Controlla la chiave copiata da BotFather.',
      409:'Il bot ha un webhook attivo oppure un altro programma sta leggendo i suoi messaggi (409). Usa un bot dedicato o scollega prima il servizio precedente.',
      403:'Il bot non puo scrivere nella chat (403). Apri la chat, sblocca il bot e premi Avvia.',
      429:'Telegram richiede una pausa (429). Attendi un minuto e riprova.',
      400:'Telegram rifiuta la richiesta (400). Verifica la chat privata e premi Avvia sul bot.'
    };
    throw new TelegramError(messages[code] || 'Telegram ha rifiutato la richiesta. Usa Verifica database e bot.');
  }
  return result.result;
}
async function configuredChat(env) {
  const row = await env.DB.prepare('SELECT value FROM feedback_config WHERE name = ?')
    .bind('telegram_chat_id').first();
  return row?.value || null;
}
export function matchingPrivateChat(updates, command, now = Date.now()) {
  if (!/^\/collega [0-9a-f-]{36}$/.test(command || '')) return null;
  const found = updates.filter(update => {
    const m = update.message;
    return m?.chat?.type === 'private' && m.from?.is_bot === false &&
      m.from.id === m.chat.id && m.text === command &&
      Number.isFinite(m.date) && now/1000-m.date >= -30 && now/1000-m.date <= 900;
  });
  const ids = new Set(found.map(u => String(u.message.chat.id)));
  return ids.size === 1 ? [...ids][0] : null;
}
async function setupTelegram(request, env) {
  if (request.method === 'GET' && new URL(request.url).pathname === '/telegram') return setupPage();
  if (request.method !== 'POST') return setupPage('Metodo non consentito.',405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return setupPage('Origine non consentita.',403);
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return setupPage('Formato non valido.',415);
  let data; try {data = await readBody(request,true);} catch {return setupPage('Richiesta non valida.',400);}
  const auth = await authorizeTelegramSetup(data,env);
  if (!auth.ok) return setupPage(auth.message,403);
  if (!env.DB) return setupPage('Collega prima il database D1 con nome DB.',503);
  let stage = 'database D1';
  try {
    await env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql)));
    let chat = await configuredChat(env);
    if (new URL(request.url).pathname === '/telegram/check') {
      stage = 'verifica Telegram';
      const me = await telegramCall(env.TELEGRAM_BOT_TOKEN,'getMe',{});
      const webhook = await telegramCall(env.TELEGRAM_BOT_TOKEN,'getWebhookInfo',{});
      return setupPage('Database D1: OK. Token: OK. Bot: @'+me.username+'. '+
        (webhook.url ? 'ATTENZIONE: webhook attivo. Il bot e gia usato da un altro servizio.' : 'Webhook: assente, OK. ')+
        (chat ? 'Una chat e gia collegata: puoi inviare una prova.' : 'Invia il nuovo comando qui sotto a QUESTO bot e collega la chat.'));
    }
    stage = 'comunicazione Telegram';
    if (new URL(request.url).pathname === '/telegram/test') {
      if (!chat) return setupPage('Prima devi collegare la chat.',409);
      await telegramCall(env.TELEGRAM_BOT_TOKEN,'sendMessage',{chat_id:chat,
        text:'E.Do.-Fa: messaggio di prova. Le notifiche Telegram funzionano.',protect_content:true});
      return setupPage('Messaggio di prova inviato alla chat collegata.');
    }
    if (chat) return setupPage('Una chat e gia collegata. Non e stata modificata. Puoi usare Invia prova su Telegram.');
    const updates = await telegramCall(env.TELEGRAM_BOT_TOKEN,'getUpdates',{limit:100,timeout:0,allowed_updates:['message']});
    chat = matchingPrivateChat(updates, data.command);
    if (!chat) return setupPage('Non trovo un messaggio valido nella tua chat privata. Copia il NUOVO codice qui sotto, invialo al bot e riprova entro 15 minuti.',400);
    stage = 'salvataggio chat in D1';
    const saved = await env.DB.prepare('INSERT OR IGNORE INTO feedback_config(name,value) VALUES (?,?)')
      .bind('telegram_chat_id',chat).run();
    if (saved.meta?.changes !== 1) return setupPage('Una chat e stata gia collegata. Nessuna modifica effettuata.',409);
    try {
      await telegramCall(env.TELEGRAM_BOT_TOKEN,'sendMessage',{chat_id:chat,
        text:'E.Do.-Fa collegato! I nuovi feedback arriveranno in questa chat privata. Nessun PDF viene trasmesso.',protect_content:true});
      return setupPage('Collegamento completato! Controlla la conferma su Telegram. Puoi chiudere questa pagina.');
    } catch (error) {return setupPage('Chat collegata, ma la conferma non e arrivata. '+
      (error instanceof TelegramError ? error.message : 'Usa Invia prova su Telegram.'),502);}
  } catch (error) {
    // Never expose an exception that might contain a token or database details.
    return setupPage(error instanceof TelegramError ? error.message :
      'Errore nella fase: '+stage+'. Verifica il binding DB e riprova. Nessun token viene mostrato in questa pagina.',503);
  }
}
export async function notifyTelegram(env, data, send = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const chat = await configuredChat(env);
  if (!chat) return;
  const claim = await env.DB.prepare('INSERT OR IGNORE INTO telegram_delivery(feedback_id,state) VALUES (?,?)')
    .bind(data.id,'in_corso').run();
  if (claim.meta?.changes !== 1) return;
  let state = 'errore';
  try {
    await telegramCall(env.TELEGRAM_BOT_TOKEN,'sendMessage',{
      chat_id:chat, text:'E.Do.-Fa | Nuovo feedback\n\n'+data.kind+'\n'+data.title+'\n\n'+data.message+'\n\nRiferimento: '+data.id,
      protect_content:true, link_preview_options:{is_disabled:true}
    }, send);
    state = 'inviato';
  } catch { /* The original feedback is already saved, even if Telegram fails. */ }
  await env.DB.prepare('UPDATE telegram_delivery SET state = ? WHERE feedback_id = ?').bind(state,data.id).run();
}
export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    const cors = request.headers.get('Origin') === ORIGIN;
    if (['/telegram','/telegram/connect','/telegram/test','/telegram/check'].includes(path)) return setupTelegram(request,env);
    if (request.method === 'GET' && (path === '/' || path === '/health')) {
      try {
        if (!env.DB) throw new Error('missing binding');
        await env.DB.prepare('SELECT 1').first();
        return reply({service: 'E.Do.-Fa feedback', ready: true});
      } catch {return reply({service: 'E.Do.-Fa feedback', ready: false,
        message: 'Collegare il database D1 con Variable name DB.'}, 503);}
    }
    if (path !== '/feedback') return reply({error: 'Pagina non trovata.'}, 404, cors);
    if (!cors) return reply({error: 'Origine non consentita.'}, 403);
    if (request.method === 'OPTIONS') return new Response(null, {
      status: 204, headers: {'Access-Control-Allow-Origin': ORIGIN,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin'}});
    if (request.method !== 'POST') return reply({error: 'Metodo non consentito.'}, 405, cors);
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
      return reply({error: 'Formato non valido.'}, 415, cors);
    if (Number(request.headers.get('Content-Length')) > MAX_BYTES)
      return reply({error: 'Messaggio troppo lungo.'}, 413, cors);
    let raw;
    try {raw = await readBody(request);} catch (error) {
      return reply({error: 'Messaggio non valido o troppo lungo.'}, error.message === 'large' ? 413 : 400, cors);
    }
    // Hidden trap field. No record or quota consumption for obvious bots.
    if (raw?.website) return reply({ok: true}, 200, cors);
    const data = validate(raw);
    if (!data) return reply({error: 'Controlla titolo, tipo e descrizione.'}, 400, cors);
    // Trust only the address supplied by Cloudflare, never a client JSON field.
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip || !env.DB) return reply({error: 'Servizio non configurato.'}, 503, cors);
    try {
      await env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql)));
      const now = new Date(), month = monthInRome(now);
      const key = await networkKey(env.DB, ip, month);
      const result = await env.DB.prepare(INSERT_FEEDBACK)
        .bind(data.id, now.toISOString(), month, key, data.kind, data.title, data.message).run();
      if (result.meta?.changes === 1) {
        const delivery = notifyTelegram(env,data).catch(() => {});
        if (ctx?.waitUntil) ctx.waitUntil(delivery); else await delivery;
        return reply({ok: true, message: 'Grazie! Feedback ricevuto.'}, 201, cors);
      }
      // Safe retries after a lost response do not consume another slot.
      const existing = await env.DB.prepare('SELECT id FROM feedback WHERE id = ? AND month = ? AND network_key = ?')
        .bind(data.id, month, key).first();
      if (existing) return reply({ok: true, message: 'Feedback gia ricevuto.'}, 200, cors);
      return reply({error: 'Da questa rete sono gia stati inviati due feedback questo mese. Riprova il prossimo mese.'}, 429, cors);
    } catch {
      // Do not log IP addresses, feedback text or private configuration.
      return reply({error: 'Servizio temporaneamente non disponibile. Riprova piu tardi.'}, 503, cors);
    }
  }
};
