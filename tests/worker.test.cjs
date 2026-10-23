const {test} = require('node:test');
const assert = require('node:assert/strict');
const origin = 'https://gitmax76.github.io';
const url = 'https://edofa-feedback.massi-sabato.workers.dev/feedback';
test('public worker rejects unknown origins before accessing D1', async () => {
  const {default: worker} = await import('../cloudflare/worker.mjs');
  const response = await worker.fetch(new Request(url, {method: 'POST',
    headers: {Origin: 'https://example.com'}}), {});
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});
test('CORS preflight accepts the actual app origin', async () => {
  const {default: worker} = await import('../cloudflare/worker.mjs');
  const response = await worker.fetch(new Request(url, {method: 'OPTIONS', headers: {Origin: origin}}), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
});
test('validation bounds feedback and rejects unexpected kinds', async () => {
  const {validate} = await import('../cloudflare/worker.mjs');
  const data = {id: crypto.randomUUID(), kind: 'Suggerimento', title: 'Una proposta', message: 'Un suggerimento per il programma.'};
  assert.ok(validate(data));
  assert.equal(validate({...data, message: 'x'.repeat(1501)}), null);
  assert.equal(validate({...data, kind: 'unknown'}), null);
  assert.equal(validate({...data, id: 'invalid'}), null);
});
test('worker rejects malformed and oversized payloads before D1', async () => {
  const {default: worker} = await import('../cloudflare/worker.mjs');
  for (const [body, status] of [['{', 400], ['x'.repeat(8193), 413]]) {
    const response = await worker.fetch(new Request(url, {method: 'POST',
      headers: {Origin: origin, 'Content-Type': 'application/json'}, body}), {});
    assert.equal(response.status, status);
  }
});
test('Rome calendar month changes at Italian midnight', async () => {
  const {monthInRome} = await import('../cloudflare/worker.mjs');
  assert.equal(monthInRome(new Date('2026-10-31T22:59:59Z')), '2026-10');
  assert.equal(monthInRome(new Date('2026-10-31T23:00:00Z')), '2026-11');
});
test('health check fails clearly when D1 is missing', async () => {
  const {default: worker} = await import('../cloudflare/worker.mjs');
  const response = await worker.fetch(new Request('https://example.workers.dev/health'), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ready, false);
});
