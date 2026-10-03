import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controls } from '@pias/core';
import { CHECKS, runChecks, type Check, type SubjectAdapter } from '../src/index.ts';

test('registry: IDs are unique, versions positive, controls in the catalog', () => {
  const ids = CHECKS.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const catalog = new Set(controls.map(c => c.id));
  for (const c of CHECKS) {
    assert.ok(Number.isInteger(c.version) && c.version > 0, c.id);
    assert.ok(catalog.has(c.control), `${c.id}: unknown control ${c.control}`);
    assert.ok(c.description, c.id);
    assert.ok(['http-api', 'backend-and-provider'].includes(c.layer), c.id);
    assert.ok(['fulfillment-records', 'http-response', 'retained-artifacts', 'audit-trail'].includes(c.oracle), c.id);
  }
});

// A subject that does nothing; the stub checks below decide their own outcomes.
function stubSubject(log: string[]): SubjectAdapter {
  const unused = () => { throw new Error('not used'); };
  return {
    id: 'stub',
    products: { standard: { sku: 's', price: 2 }, cheap: { sku: 'c', price: 1 } },
    provider: { name: 'stub-provider', apiVersion: '9' },
    createOrder: unused, startPayment: unused, readOrder: unused, deliver: unused,
    fulfillments: async () => 0,
    activeFulfillments: async () => 0,
    close: async () => { log.push('close'); },
  };
}

test('checks that read artifacts are unknown, never pass, on a subject that offers none', async () => {
  const reading = CHECKS.filter(c => ['secrets', 'data', 'operations'].includes(c.control));
  assert.equal(reading.length, 6);
  const results = await runChecks(reading, async () => stubSubject([]), { runId: 'R0', authorizationId: 'test' });
  for (const control of ['secrets', 'data', 'operations']) {
    assert.equal(results[control].status, 'unknown', control);
    for (const r of results[control].records) assert.equal(r.error, 'subject offers no artifact access');
  }
});

const stub = (id: string, control: string, run: Check['run']): Check =>
  ({ id, version: 1, control, layer: 'http-api', oracle: 'http-response', description: id, run });
const ok: Check['run'] = async () => ({ expected: 1, observed: 1 });
const bad: Check['run'] = async () => ({ expected: 1, observed: 2 });
const boom: Check['run'] = async () => { throw new Error('subject crashed'); };

test('runner: pass, fail and errored checks map to pass, fail and unknown', async () => {
  const log: string[] = [];
  const results = await runChecks([
    stub('a1', 'amount', ok), stub('a2', 'amount', ok),
    stub('b1', 'binding', ok), stub('b2', 'binding', bad),
    stub('c1', 'authenticity', ok), stub('c2', 'authenticity', boom),
    stub('d1', 'fulfillment', bad), stub('d2', 'fulfillment', boom),
  ], async () => stubSubject(log), { runId: 'R1', authorizationId: 'test' });

  assert.equal(results.amount.status, 'pass');
  assert.equal(results.amount.evidence, 'stub:amount:2/2-checks-passed');
  assert.equal(results.binding.status, 'fail');
  assert.equal(results.authenticity.status, 'unknown', 'an errored check is never a pass');
  assert.equal(results.authenticity.evidence, undefined);
  assert.equal(results.authenticity.records[1].error, 'subject crashed');
  assert.equal(results.authenticity.records[1].status, 'unknown');
  assert.equal(results.amount.records[0].record_id, 'R1/a1@1');
  assert.equal(results.amount.records[0].provider_api_version, '9');
  assert.equal(results.amount.records[0].provenance, null, 'no provenance unless the caller supplies it');
  assert.equal(results.fulfillment.status, 'fail', 'a real failure outweighs an error');
  assert.deepEqual(log, ['close', 'close', 'close', 'close'], 'one fresh subject per control, always closed');
});
