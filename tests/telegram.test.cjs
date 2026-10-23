const {test} = require('node:test');
const assert = require('node:assert/strict');
const code='/collega 12345678-1234-4234-8234-123456789abc';
const now=1800000000000;
function update(extra={}) {return {message:{text:code,date:now/1000,
  chat:{type:'private',id:42},from:{id:42,is_bot:false},...extra}};}
test('pairing accepts the matching recent private chat only',async()=>{
  const {matchingPrivateChat}=await import('../cloudflare/worker.mjs');
  assert.equal(matchingPrivateChat([update()],code,now),'42');
  assert.equal(matchingPrivateChat([update({text:'/start'})],code,now),null);
  assert.equal(matchingPrivateChat([update({date:now/1000-901})],code,now),null);
  assert.equal(matchingPrivateChat([update({chat:{type:'group',id:42}})],code,now),null);
  assert.equal(matchingPrivateChat([update({from:{id:43,is_bot:false}})],code,now),null);
  assert.equal(matchingPrivateChat([update({from:{id:42,is_bot:true}})],code,now),null);
});
test('ambiguous pairing cannot select someone else',async()=>{
  const {matchingPrivateChat}=await import('../cloudflare/worker.mjs');
  assert.equal(matchingPrivateChat([update(),update({chat:{type:'private',id:43},from:{id:43,is_bot:false}})],code,now),null);
});
test('setup page has no scripts, escapes notices and never embeds secrets',async()=>{
  const {setupPage}=await import('../cloudflare/worker.mjs');
  const page=setupPage('<script>alert(1)</script>');
  assert.equal(page.headers.get('Cache-Control'),'no-store');
  // no-referrer makes native form POSTs send Origin:null, rejecting our own page.
  assert.equal(page.headers.get('Referrer-Policy'),'same-origin');
  assert.match(page.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  const html=await page.text();
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('type="password"'));
});
test('setup rejects cross-origin requests and missing credentials',async()=>{
  const {default:worker}=await import('../cloudflare/worker.mjs');
  const url='https://edofa-feedback.massi-sabato.workers.dev/telegram/connect';
  const headers={'Content-Type':'application/x-www-form-urlencoded',Origin:'https://evil.example'};
  assert.equal((await worker.fetch(new Request(url,{method:'POST',headers,body:'key=wrong'}),{})).status,403);
  headers.Origin=new URL(url).origin;
  assert.equal((await worker.fetch(new Request(url,{method:'POST',headers,body:'key=wrong'}),{})).status,403);
});
function mockDB(claim=1) {
  const writes=[];
  return {writes,prepare(sql){return {bind(...args){return {
    async first(){return {value:'42'};},
    async run(){writes.push({sql,args});return {meta:{changes:claim}};}
  };}};}};
}
test('notification targets only the configured chat without parsing feedback as HTML',async()=>{
  const {notifyTelegram}=await import('../cloudflare/worker.mjs');
  const DB=mockDB();const calls=[];
  await notifyTelegram({DB,TELEGRAM_BOT_TOKEN:'123:EXAMPLE'},
    {id:'example',kind:'Problema',title:'<b>Test</b>',message:'A link https://example.com'},
    async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,result:{}})};});
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.chat_id,'42');
  assert.equal(calls[0].body.parse_mode,undefined);
  assert.equal(calls[0].body.link_preview_options.is_disabled,true);
  assert.ok(!JSON.stringify(calls[0].body).includes('network_key'));
  assert.equal(DB.writes.at(-1).args[0],'inviato');
});
test('notification failure is recorded without failing saved feedback',async()=>{
  const {notifyTelegram}=await import('../cloudflare/worker.mjs');
  const DB=mockDB();
  await notifyTelegram({DB,TELEGRAM_BOT_TOKEN:'123:EXAMPLE'},
    {id:'example',kind:'Problema',title:'Test',message:'Test'},async()=>{throw Error('network');});
  assert.equal(DB.writes.at(-1).args[0],'errore');
});
test('duplicate notification claim never sends again',async()=>{
  const {notifyTelegram}=await import('../cloudflare/worker.mjs');
  let sent=false;
  await notifyTelegram({DB:mockDB(0),TELEGRAM_BOT_TOKEN:'123:EXAMPLE'},{id:'example'},async()=>{sent=true;});
  assert.equal(sent,false);
});
