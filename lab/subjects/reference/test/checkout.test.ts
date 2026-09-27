import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../assess.ts';
import { DEFECTS, createCheckout, type Defect } from '../app.ts';
import { sign, verify } from '../../../emulator/signature.ts';

// Which control each seeded defect must break. Every other assessed control must still pass.
const target: Record<Defect, string> = {
  trustClientAmount: 'amount',
  skipAmountMatch: 'amount',
  skipOrderMatch: 'binding',
  skipSignature: 'authenticity',
  fulfillOnAnyStatus: 'fulfillment',
  skipOwnership: 'authorization',
  noIdempotency: 'idempotency',
};

const failed = (r: Awaited<ReturnType<typeof assess>>) =>
  Object.keys(r.results).filter(c => r.results[c].status === 'fail');

test('every seeded defect has an expected control', () => {
  assert.deepEqual(Object.keys(target).sort(), Object.keys(DEFECTS).sort());
});

test('baseline checkout passes every assessed control', async () => {
  const r = await assess([]);
  assert.deepEqual(failed(r), []);
  assert.equal(r.score.criticalFailures.length, 0);
  assert.equal(r.score.gate, 'insufficient-evidence');
});

for (const [defect, control] of Object.entries(target)) {
  test(`seeded ${defect} is detected only by ${control}`, async () => {
    assert.deepEqual(failed(await assess([defect])), [control]);
  });
}

test('signature rejects edits, other keys and stale timestamps', () => {
  const s = sign('{}', 'k', 1000);
  assert.equal(verify('{}', s, 'k', 1000), true);
  assert.equal(verify('{ }', s, 'k', 1000), false);
  assert.equal(verify('{}', s, 'other', 1000), false);
  assert.equal(verify('{}', s, 'k', 1000 + 301), false);
  assert.equal(verify('{}', 't=1000,v1=zz', 'k', 1000), false);
  assert.equal(verify('{}', undefined, 'k', 1000), false);
});

test('checkout requires a secret and rejects unknown defects', () => {
  assert.throws(() => createCheckout({ secret: '' }));
  assert.throws(() => createCheckout({ secret: 'x', defects: ['typo'] }));
});
