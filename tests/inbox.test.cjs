const {test}=require('node:test');
const assert=require('node:assert/strict');
test('inbox session is signed, expires, and rejects tampering or a different key',async()=>{
 const {makeAdminSession,validAdminSession}=await import('../cloudflare/worker.mjs');
 const now=1800000000000, token='123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789';
 const session=await makeAdminSession(token,now);
 assert.equal(await validAdminSession(session,token,now),true);
 assert.equal(await validAdminSession(session,token,now+3601000),false);
 assert.equal(await validAdminSession(session+'x',token,now),false);
 assert.equal(await validAdminSession(session,'different',now),false);
 assert.ok(!session.includes(token));
});
test('anonymous access never queries private messages',async()=>{
 const {default:worker}=await import('../cloudflare/worker.mjs');
 const response=await worker.fetch(new Request('https://example.workers.dev/admin'),{
  DB:{prepare(){throw Error('private access attempted');}}
 });
 assert.equal(response.status,200);
 assert.match(await response.text(),/Accesso riservato/);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('owner can log in and read D1 without Telegram or any outbound fetch',async()=>{
 const {default:worker}=await import('../cloudflare/worker.mjs');
 const origin='https://example.workers.dev',token='123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789';
 const DB={async batch(){return [];},prepare(sql){return {
  async first(){return {total:1};},bind(){return {async all(){return {results:[{
   created_at:'2026-10-24T08:00:00Z',kind:'Problema',title:'<script>bad()</script>',message:'Un messaggio privato.'
  }]};}};}
 };}};
 const env={TELEGRAM_BOT_TOKEN:token,DB};
 const login=await worker.fetch(new Request(origin+'/admin/login',{method:'POST',headers:{Origin:origin,
  'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({key:token})}),env);
 assert.equal(login.status,303);
 const cookie=login.headers.get('Set-Cookie');
 assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
 const page=await worker.fetch(new Request(origin+'/admin',{headers:{Cookie:cookie.split(';')[0]}}),env);
 const html=await page.text();
 assert.equal(page.status,200);
 assert.ok(html.includes('Un messaggio privato.'));
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>'));
 assert.ok(!html.includes(token));
});
test('private inbox rejects cross-origin login',async()=>{
 const {default:worker}=await import('../cloudflare/worker.mjs');
 const response=await worker.fetch(new Request('https://example.workers.dev/admin/login',{method:'POST',
  headers:{Origin:'https://other.example','Content-Type':'application/x-www-form-urlencoded'},body:'key=test'}),{});
 assert.equal(response.status,403);
});
