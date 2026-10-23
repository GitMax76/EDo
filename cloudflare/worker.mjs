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
  <p>Questa pagina serve al proprietario di E.Do.-Fa, una sola volta. Non inserire il token del bot qui.</p>
  <ol><li>In Cloudflare, nelle impostazioni del Worker, aggiungi un segreto <b>TELEGRAM_SETUP_KEY</b>: scegli una password riservata di almeno 20 caratteri. Solo Production, tipo Secret.</li>
  <li>Apri la chat privata con il tuo bot e inviagli questo messaggio (puoi selezionarlo e copiarlo):<code>${command}</code></li>
  <li>Entro 15 minuti, inserisci qui la password che hai salvato come TELEGRAM_SETUP_KEY e premi il pulsante.</li></ol>
  <form action="/telegram/connect" method="post">
  <input type="hidden" name="command" value="${command}">
  <label for="key">Password di collegamento (TELEGRAM_SETUP_KEY)</label>
  <input id="key" name="key" type="password" required minlength="20" maxlength="200" autocomplete="off">
  <button>Collega la mia chat e invia la conferma</button></form>
  <details><summary>La chat e gia collegata? Invia un messaggio di prova</summary>
  <form action="/telegram/test" method="post"><label for="testkey">Password di collegamento</label>
  <input id="testkey" name="key" type="password" required minlength="20" maxlength="200" autocomplete="off"><button>Invia prova su Telegram</button></form></details>
  <p>Il codice non e la password. Il collegamento richiede entrambi e accetta solo chat private. Non modifica il limite mensile dei feedback.</p>
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
async function telegramCall(token, method, data, send = fetch) {
  if (!token || !/^[0-9]+:[A-Za-z0-9_-]+$/.test(token)) throw Error('Telegram non configurato: verifica TELEGRAM_BOT_TOKEN.');
  // The token is used only server-side with the official Telegram API.
  const res = await send('https://api.telegram.org/bot'+token+'/'+method, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data),
    signal:AbortSignal.timeout(10000), redirect:'error'
  });
  const result = await res.json();
  if (!res.ok || result.ok !== true) throw Error('Telegram non risponde. Verifica il token, avvia il bot e usa un bot dedicato senza webhook.');
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
  if (!await validSetupKey(data.key, env.TELEGRAM_SETUP_KEY))
    return setupPage('Password non corretta oppure TELEGRAM_SETUP_KEY non configurato come segreto di almeno 20 caratteri.',403);
  if (!env.DB) return setupPage('Collega prima il database D1 con nome DB.',503);
  try {
    await env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql)));
    let chat = await configuredChat(env);
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
    const saved = await env.DB.prepare('INSERT OR IGNORE INTO feedback_config(name,value) VALUES (?,?)')
      .bind('telegram_chat_id',chat).run();
    if (saved.meta?.changes !== 1) return setupPage('Una chat e stata gia collegata. Nessuna modifica effettuata.',409);
    try {
      await telegramCall(env.TELEGRAM_BOT_TOKEN,'sendMessage',{chat_id:chat,
        text:'E.Do.-Fa collegato! I nuovi feedback arriveranno in questa chat privata. Nessun PDF viene trasmesso.',protect_content:true});
      return setupPage('Collegamento completato! Controlla la conferma su Telegram. Puoi chiudere questa pagina.');
    } catch {return setupPage('Chat collegata, ma la conferma non e arrivata. Avvia il bot, poi usa Invia prova su Telegram.',502);}
  } catch (error) {
    // Never expose an exception that might contain a token or database details.
    return setupPage('Collegamento non riuscito. Verifica DB e TELEGRAM_BOT_TOKEN. Se il bot usa gia un webhook, usa un bot dedicato.',503);
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
    if (['/telegram','/telegram/connect','/telegram/test'].includes(path)) return setupTelegram(request,env);
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
