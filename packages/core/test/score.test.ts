import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, controls, type Results, type Status } from '@pias/core';

const all = (status: Status): Results =>
  Object.fromEntries(controls.map(c => [c.id, { status, evidence: 'synthetic:test' }]));

test('full pass and failure extremes', () => {
  assert.equal(score(controls, all('pass')).lower, 100);
  assert.equal(score(controls, all('fail')).upper, 0);
});

test('unknown is not a pass or a failure', () => {
  const r = score(controls, {});
  assert.equal(r.lower, 0);
  assert.equal(r.upper, 100);
  assert.equal(r.observed, null);
  assert.equal(r.gate, 'insufficient-evidence');
});

test('critical failure is visible even at high aggregate', () => {
  const results = all('pass');
  results.authenticity.status = 'fail';
  const r = score(controls, results);
  assert.equal(r.lower, 90);
  assert.equal(r.gate, 'critical-failure');
});

test('unassessed critical control blocks rating', () => {
  const results = all('pass');
  delete results.binding;
  assert.equal(score(controls, results).gate, 'insufficient-evidence');
});

test('missing evidence and unjustified N/A rejected', () => {
  assert.throws(() => score(controls, { amount: { status: 'pass' } }));
  assert.throws(() => score(controls, { amount: { status: 'na' } }));
});

test('N/A changes denominator only after review', () => {
  const results = all('pass');
  results.browser = { status: 'na', reviewed: true, rationale: 'Fixture has no browser surface' };
  assert.equal(score(controls, results).lower, 100);
});

test('malformed catalog and unknown controls rejected', () => {
  assert.throws(() => score(controls, { typo: { status: 'pass' } }));
  assert.throws(() => score([{ id: 'x', title: 'x', weight: 0, critical: false }], {}));
});
