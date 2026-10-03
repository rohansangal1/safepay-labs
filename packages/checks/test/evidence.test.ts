import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_SCHEMA_VERSION, MAX_TEXT, REDACTION_POLICY, evidenceRecord, redactText, redactValue,
  runChecks, validateEvidence, type Check, type EvidenceRecord, type RunProvenance, type SubjectAdapter,
} from '../src/index.ts';

const check = { id: 'c1', version: 2, control: 'amount', layer: 'http-api', oracle: 'http-response', description: 'a check' } as const;
const subject = { id: 'stub', provider: { name: 'stub-provider', apiVersion: '9' } };
const context = { runId: 'R1', authorizationId: 'test' };
const provenance: RunProvenance = {
  source_commit: 'a'.repeat(40),
  source_dirty: false,
  harness_commit: 'b'.repeat(40),
  dependency_lock_sha256: 'c'.repeat(64),
  runtime: 'node-v24.0.0',
};
const times = { started: new Date('2026-10-03T10:00:00.000Z'), ended: new Date('2026-10-03T10:00:01.000Z') };
const passing = () => evidenceRecord(check, subject, context, { expected: 0, observed: 0 });
const errorsFor = (change: Partial<EvidenceRecord> | Record<string, unknown>, options?: { requireProvenance?: boolean }) =>
  validateEvidence({ ...passing(), ...change }, options).join('\n');

test('redaction: card numbers, keys, tokens, secrets and emails are removed from text', () => {
  assert.equal(redactText('card 4242 4242 4242 4242 declined').text, 'card [redacted:card-number] declined');
  assert.equal(redactText('order 1234567890123456').text, 'order 1234567890123456', 'digits that fail the Luhn check are kept');
  assert.equal(redactText('key sk_test_abcdefgh12345678').text, 'key [redacted:provider-key]');
  assert.equal(redactText('whsec_abcdefgh12345678 rejected').text, '[redacted:provider-key] rejected');
  assert.equal(redactText('Authorization: Bearer abc.def-ghi_123').text, 'Authorization: [redacted:bearer-token]');
  assert.equal(redactText('secret ' + 'ab12'.repeat(16)).text, 'secret [redacted:secret]');
  assert.equal(redactText('sent to alice@example.com').text, 'sent to [redacted:email]');
  assert.deepEqual(redactText('alice@example.com 4242424242424242').redactions, ['card-number', 'email']);
  assert.deepEqual(redactText('createOrder returned 500'), { text: 'createOrder returned 500', redactions: [] });
});

test('redaction: long text is capped and stays clean after the cut', () => {
  const long = redactText('x'.repeat(MAX_TEXT + 50));
  assert.equal(long.text.length, MAX_TEXT);
  assert.deepEqual(long.redactions, ['truncated']);
  // A hex run that only becomes a whole word once the text is cut.
  const cut = redactText('x '.repeat((MAX_TEXT - 40) / 2) + 'ab'.repeat(20) + 'zz');
  assert.equal(redactText(cut.text).text, cut.text);
  assert.ok(!/[a-f0-9]{32}/.test(cut.text));
});

test('redaction: only scalars are stored', () => {
  assert.deepEqual(redactValue(5000), { value: 5000, redactions: [] });
  assert.deepEqual(redactValue(undefined), { value: null, redactions: [] });
  assert.deepEqual(redactValue({ card: '4242424242424242' }), { value: '[redacted:non-scalar]', redactions: ['non-scalar'] });
  assert.equal(redactValue(NaN).value, 'NaN');
});

test('records: built records are valid and carry versions', () => {
  const r = passing();
  assert.deepEqual(validateEvidence(r), []);
  assert.equal(r.schema_version, EVIDENCE_SCHEMA_VERSION);
  assert.equal(r.redaction_policy, REDACTION_POLICY);
  assert.equal(r.record_id, 'R1/c1@2');
  assert.equal(r.status, 'pass');
  assert.equal(r.provider, 'stub-provider');
  assert.equal(r.provenance, null);
});

test('records: a missing observation or an error is never a pass', () => {
  assert.equal(evidenceRecord(check, subject, context, { expected: undefined, observed: undefined }).status, 'fail');
  assert.equal(evidenceRecord(check, subject, context, { expected: 1, observed: undefined }).status, 'fail');
  const errored = evidenceRecord(check, subject, context, { error: 'boom for alice@example.com' });
  assert.equal(errored.status, 'unknown');
  assert.equal(errored.review_state, 'needs-review');
  assert.equal(errored.error, 'boom for [redacted:email]');
  assert.deepEqual(errored.redactions, ['email']);
  assert.deepEqual(validateEvidence(errored), []);
});

test('records: non-scalar observations are dropped, not stored', () => {
  const r = evidenceRecord(check, subject, context, { expected: { a: 1 }, observed: { a: 1 } });
  assert.equal(r.status, 'fail', 'objects are never equal, so this cannot pass');
  assert.equal(r.observed, '[redacted:non-scalar]');
  assert.deepEqual(validateEvidence(r), []);
});

test('records: provenance carries commit, lock hash, runtime and timestamps', () => {
  const r = evidenceRecord(check, subject, { ...context, provenance }, { expected: 0, observed: 0 }, times);
  assert.deepEqual(validateEvidence(r, { requireProvenance: true }), []);
  assert.deepEqual(r.provenance, { ...provenance, started_at: '2026-10-03T10:00:00.000Z', ended_at: '2026-10-03T10:00:01.000Z' });
  assert.throws(() => evidenceRecord(check, subject, { ...context, provenance }, { expected: 0, observed: 0 }), /start and end times/);
});

test('validator: rejects fields outside the allowlist and missing fields', () => {
  assert.match(errorsFor({ raw_body: '{}' }), /raw_body: not an allowed field/);
  const { status, ...rest } = passing();
  assert.match(validateEvidence(rest).join('\n'), /status: missing/);
  assert.deepEqual(validateEvidence(null), ['record must be an object']);
});

test('validator: enforces unknown-is-never-pass', () => {
  assert.match(errorsFor({ observed: null, expected: null }), /a pass needs an observation/);
  assert.match(errorsFor({ observed: 1 }), /observed to equal expected/);
  assert.match(errorsFor({ error: 'boom' }), /a pass cannot carry an error/);
  assert.match(errorsFor({ status: 'fail' }), /observed to differ/);
  assert.match(errorsFor({ status: 'fail', error: 'boom' }), /errored is unknown/);
  assert.match(errorsFor({ status: 'unknown' }), /needs the error/);
  assert.match(errorsFor({ status: 'maybe' }), /must be pass, fail or unknown/);
});

test('validator: rejects stored text the redaction policy would remove', () => {
  assert.match(errorsFor({ description: 'paid with 4242424242424242' }), /description: contains text/);
  assert.match(errorsFor({ expected: 'sk_live_abcdefgh12345678', observed: 'sk_live_abcdefgh12345678' }), /expected: contains text/);
  assert.match(errorsFor({ subject_id: 'shop-' + 'ab12'.repeat(16) }), /subject_id: contains text/);
  assert.match(errorsFor({ expected: { a: 1 }, observed: { a: 1 } }), /expected: must be a scalar/);
});

test('validator: versions, identifiers and provenance are checked', () => {
  assert.match(errorsFor({ schema_version: '0.9' }), /schema_version/);
  assert.match(errorsFor({ redaction_policy: 'none' }), /redaction_policy/);
  assert.match(errorsFor({ record_id: 'other' }), /record_id/);
  assert.match(errorsFor({ check_version: 0 }), /check_version/);
  assert.match(errorsFor({ observation_layer: 'browser' }), /observation_layer/);
  assert.match(errorsFor({ artifact_sha256: 'abc' }), /artifact_sha256/);
  assert.match(errorsFor({}, { requireProvenance: true }), /provenance: required/);
  const full = { ...provenance, started_at: '2026-10-03T10:00:01.000Z', ended_at: '2026-10-03T10:00:00.000Z' };
  assert.match(errorsFor({ provenance: full }), /before started_at/);
  assert.match(errorsFor({ provenance: { ...full, source_commit: 'abc123' } }), /full commit SHA/);
  assert.match(errorsFor({ provenance: { ...full, hostname: 'laptop' } }), /provenance.hostname: not an allowed field/);
  assert.match(errorsFor({ provenance: { ...full, started_at: 'yesterday' } }), /ISO 8601/);
});

test('runner: stamps each record from the injected clock and redacts subject errors', async () => {
  const unused = () => { throw new Error('not used'); };
  const stub: SubjectAdapter = {
    id: 'stub',
    products: { standard: { sku: 's', price: 2 }, cheap: { sku: 'c', price: 1 } },
    createOrder: unused, startPayment: unused, readOrder: unused, deliver: unused,
    fulfillments: async () => 0,
    activeFulfillments: async () => 0,
    close: async () => {},
  };
  const checks: Check[] = [
    { ...check, id: 'ok', run: async () => ({ expected: 1, observed: 1 }) },
    { ...check, id: 'leaky', run: async () => { throw new Error('rejected key whsec_abcdefgh12345678'); } },
  ];
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 3, 10, 0, tick++));
  const results = await runChecks(checks, async () => stub, { ...context, provenance, now });
  const [ok, leaky] = results.amount.records;
  assert.equal(ok.provenance?.started_at, '2026-10-03T10:00:00.000Z');
  assert.equal(ok.provenance?.ended_at, '2026-10-03T10:00:01.000Z');
  assert.equal(ok.provider, null, 'a subject that names no provider records none');
  assert.equal(leaky.error, 'rejected key [redacted:provider-key]');
  assert.equal(results.amount.status, 'unknown');
});
