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
test('Telegram diagnostics distinguish missing, malformed and rejected tokens',async()=>{
  const {telegramCall}=await import('../cloudflare/worker.mjs');
  await assert.rejects(telegramCall('', 'getMe', {}), /Manca il segreto/);
  await assert.rejects(telegramCall('not-a-token', 'getMe', {}), /Formato del token/);
  await assert.rejects(telegramCall('123:EXAMPLE','getMe',{},async()=>({ok:false,status:401,
    json:async()=>({ok:false,error_code:401,description:'sensitive server description'})})),
    error => error.message.includes('(401)') && !error.message.includes('sensitive'));
});
test('token whitespace is trimmed without exposing it in errors',async()=>{
  const {telegramCall}=await import('../cloudflare/worker.mjs');
  const result=await telegramCall(' 123:EXAMPLE\n','getMe',{},async url=>{
    assert.equal(url,'https://api.telegram.org/bot123:EXAMPLE/getMe');
    return {ok:true,json:async()=>({ok:true,result:{username:'test_bot'}})};
  });
  assert.equal(result.username,'test_bot');
  await assert.rejects(telegramCall('123:EXAMPLE','getMe',{},async()=>{throw Error('123:EXAMPLE');}),
    error => !error.message.includes('EXAMPLE') && error.message.includes('Connessione'));
});
test('database setup errors report stage without leaking raw exceptions',async()=>{
  const {default:worker}=await import('../cloudflare/worker.mjs');
  const key='a-long-setup-password-for-test';
  const url='https://example.workers.dev/telegram/check';
  const response=await worker.fetch(new Request(url,{method:'POST',headers:{Origin:new URL(url).origin,
    'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({key})}),
    {TELEGRAM_SETUP_KEY:key,DB:{prepare(){return {};},async batch(){throw Error('private-database-details');}}});
  const html=await response.text();
  assert.equal(response.status,503);
  assert.ok(html.includes('fase: database D1'));
  assert.ok(!html.includes('private-database-details'));
});
test('new setup uses the existing bot token and needs no extra password',async()=>{
  const {authorizeTelegramSetup}=await import('../cloudflare/worker.mjs');
  const token='123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789';
  assert.equal((await authorizeTelegramSetup({auth:'token',key:token},{TELEGRAM_BOT_TOKEN:token})).ok,true);
  assert.equal((await authorizeTelegramSetup({auth:'token',key:' '+token+'\n'},{TELEGRAM_BOT_TOKEN:' '+token+' '})).ok,true);
  const other=await authorizeTelegramSetup({auth:'token',key:'987654321:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789'},
    {TELEGRAM_BOT_TOKEN:token});
  assert.equal(other.ok,false);
  assert.match(other.message,/diverso/);
  assert.ok(!other.message.includes(token));
});
test('new setup identifies missing token and password used in the wrong field',async()=>{
  const {authorizeTelegramSetup}=await import('../cloudflare/worker.mjs');
  assert.match((await authorizeTelegramSetup({auth:'token',key:'anything'},{})).message,/manca TELEGRAM_BOT_TOKEN/);
  const token='123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789';
  assert.match((await authorizeTelegramSetup({auth:'token',key:'a-password-with-20-characters'},
    {TELEGRAM_BOT_TOKEN:token})).message,/non la password/);
});
