const {test} = require('node:test');
const assert = require('node:assert/strict');
const {decideFeedback, monthInRome} = require('../scripts/moderate-feedback.cjs');
const make = (number, date = '2026-10-23T12:00:00Z', user = 7, extra = {}) =>
  ({number, created_at: date, user: {id: user, login: `user${user}`}, ...extra});

test('first and second accepted; third rejected including closed issues', () => {
  const issues = [make(1), make(2, undefined, 7, {state: 'closed'}), make(3)];
  assert.equal(decideFeedback(issues[0], issues).allowed, true);
  assert.equal(decideFeedback(issues[1], issues).allowed, true);
  assert.equal(decideFeedback(issues[2], issues).allowed, false);
});
test('the counter resets with a new Italian calendar month', () => {
  const current = make(3, '2026-11-01T00:00:00Z');
  assert.equal(decideFeedback(current, [make(1), make(2)]).rank, 1);
});
test('Italian midnight is respected in winter and summer', () => {
  assert.equal(monthInRome('2026-10-31T23:30:00Z'), '2026-11');
  assert.equal(monthInRome('2026-06-30T22:30:00Z'), '2026-07');
});
test('other accounts and pull requests do not consume the quota', () => {
  const current = make(4);
  assert.equal(decideFeedback(current, [make(1, undefined, 8), make(2, undefined, 7, {pull_request: {}})]).rank, 1);
});
test('rank is deterministic even when events execute out of order', () => {
  const issues = [make(3), make(1), make(2)];
  assert.equal(decideFeedback(make(3), issues).allowed, false);
  assert.equal(decideFeedback(make(1), issues).allowed, true);
});
test('reopening rejected feedback does not reset its rank', () => {
  assert.equal(decideFeedback(make(3), [make(1), make(2), make(3)]).rank, 3);
});
test('an event absent from the API listing is still counted once', () => {
  assert.equal(decideFeedback(make(2), [make(1)]).rank, 2);
  assert.equal(decideFeedback(make(2), [make(1), make(2)]).rank, 2);
});
