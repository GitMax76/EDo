const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(fetch) {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, {value: '', textContent: '', disabled: false, events: {},
      addEventListener(name, cb) {this.events[name] = cb;}, setAttribute() {},
      reportValidity() {return true;}, showModal() {}, close() {},
      reset() {get('feedback-title').value = ''; get('feedback-message').value = '';}});
    return nodes.get(id);
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../docs/feedback.js'), 'utf8'), {
    document: {getElementById: get}, fetch, crypto, AbortController, setTimeout, clearTimeout, TypeError
  });
  get('feedback-title').value = 'Proposta di prova';
  get('feedback-message').value = 'Un suggerimento per migliorare il programma.';
  get('feedback-kind').value = 'Suggerimento';
  return {get, submit: () => get('feedback-form').events.submit({preventDefault() {}})};
}
test('network retry keeps text and ID, success clears text; sends no document', async () => {
  const requests = [];
  const ui = setup(async (url, options) => {
    requests.push({url, options});
    if (requests.length === 1) throw new TypeError('network');
    return {ok: true, json: async () => ({ok: true})};
  });
  await ui.submit();
  assert.equal(ui.get('feedback-title').value, 'Proposta di prova');
  await ui.submit();
  assert.equal(ui.get('feedback-title').value, '');
  const bodies = requests.map(r => JSON.parse(r.options.body));
  assert.equal(bodies[0].id, bodies[1].id);
  assert.deepEqual(Object.keys(bodies[0]).sort(), ['id', 'kind', 'message', 'title', 'website']);
  assert.equal(requests[0].options.credentials, 'omit');
});
test('quota rejection preserves the message and displays the server explanation', async () => {
  const ui = setup(async () => ({ok: false, status: 429,
    json: async () => ({error: 'Limite mensile raggiunto.'})}));
  await ui.submit();
  assert.equal(ui.get('feedback-status').textContent, 'Limite mensile raggiunto.');
  assert.ok(ui.get('feedback-message').value);
  assert.equal(ui.get('feedback-submit').disabled, false);
});
test('double click during sending does not issue a second request', async () => {
  let resolve, calls = 0;
  const pending = new Promise(r => {resolve = r;});
  const ui = setup(async () => {calls++; await pending; return {ok: true, json: async () => ({ok: true})};});
  const first = ui.submit();
  await ui.submit();
  assert.equal(calls, 1);
  assert.equal(ui.get('feedback-submit').disabled, true);
  resolve(); await first;
  assert.equal(ui.get('feedback-submit').disabled, false);
});
