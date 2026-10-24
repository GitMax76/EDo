const {test}=require('node:test');
const assert=require('node:assert/strict');
test('report API never exposes private rows to anonymous callers',async()=>{
 const {default:worker}=await import('../cloudflare/worker.mjs');
 const response=await worker.fetch(new Request('https://example.workers.dev/reports/list',{method:'POST',body:'{}'}),{});
 assert.equal(response.status,401);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
});
test('report API rejects unbounded history exports',async()=>{
 const {default:worker}=await import('../cloudflare/worker.mjs');
 const token='123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789';
 const response=await worker.fetch(new Request('https://example.workers.dev/reports/list',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({from:'2026-01-01T00:00:00Z',to:'2026-10-01T00:00:00Z'})}),
  {TELEGRAM_BOT_TOKEN:token,DB:{prepare(){return {};},async batch(){return [];}}});
 assert.equal(response.status,400);
});
