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
  `CREATE INDEX IF NOT EXISTS feedback_quota ON feedback(month, network_key)`
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
async function readBody(request) {
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
  return JSON.parse(new TextDecoder().decode(body));
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
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const cors = request.headers.get('Origin') === ORIGIN;
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
      if (result.meta?.changes === 1) return reply({ok: true, message: 'Grazie! Feedback ricevuto.'}, 201, cors);
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
