// Evidence schema v1 (ADR 009; 1.1 adds two oracles, ADR 010). One record per check run: what was tested, by which version of
// which check, what was expected and observed, and the provenance needed to reproduce it.
// Records are the only form in which check results are stored, so redaction is applied here
// and the validator refuses anything outside the allowlist.
import { METRIC_VERSION } from '@pias/core';
import type { SubjectAdapter } from './adapter.ts';
import { REGISTRY_VERSION, type Check, type Layer, type Oracle } from './registry.ts';

/** Bumped whenever a field is added, removed or changes meaning. */
export const EVIDENCE_SCHEMA_VERSION = '1.1';
/** Names the rules in this file: allowlisted fields, scalar values, scrubbed and capped text. */
export const REDACTION_POLICY = 'allowlist-v1';

export type Scalar = number | boolean | string | null;
export type EvidenceStatus = 'pass' | 'fail' | 'unknown';
/** 'adjudicated' is reserved for human review; the runner only writes the other two. */
export type ReviewState = 'automated' | 'needs-review' | 'adjudicated';

/** What ties a run to the code that produced it. Supplied by the caller, never guessed. */
export interface RunProvenance {
  /** Commit of the subject under test. */
  source_commit: string;
  /** True when the working tree had uncommitted changes, so the commit alone doesn't reproduce the run. */
  source_dirty: boolean;
  /** Commit of the checks and harness. */
  harness_commit: string;
  dependency_lock_sha256: string;
  runtime: string;
}

export interface Provenance extends RunProvenance {
  /** When this check started and ended, ISO 8601 UTC. */
  started_at: string;
  ended_at: string;
}

export interface RunContext {
  /** Identifies one run of the checks against one subject. */
  runId: string;
  /** The scope authorization the run was made under (see docs/SAFETY.md). */
  authorizationId: string;
  /**
   * Omit for committed fixtures: commits and timestamps change on every run, and generated
   * files must be reproducible. Records then carry `provenance: null`.
   */
  provenance?: RunProvenance;
  now?: () => Date;
}

export interface EvidenceRecord {
  schema_version: string;
  /** `<run_id>/<check_id>@<check_version>`, unique within a dataset. */
  record_id: string;
  run_id: string;
  subject_id: string;
  authorization_id: string;
  control_id: string;
  check_id: string;
  check_version: number;
  registry_version: string;
  metric_version: string;
  observation_layer: Layer;
  oracle: Oracle;
  description: string;
  /** 'unknown' when the check could not run to completion. Never a pass. */
  status: EvidenceStatus;
  expected: Scalar;
  observed: Scalar;
  error: string | null;
  review_state: ReviewState;
  provider: string | null;
  provider_api_version: string | null;
  /** Hash of a raw artifact kept outside the dataset. Null until a harness stores one. */
  artifact_sha256: string | null;
  redaction_policy: string;
  /** Kinds of redaction applied to this record's values, for audit. */
  redactions: string[];
  provenance: Provenance | null;
}

const FIELDS: readonly (keyof EvidenceRecord)[] = [
  'schema_version', 'record_id', 'run_id', 'subject_id', 'authorization_id', 'control_id',
  'check_id', 'check_version', 'registry_version', 'metric_version', 'observation_layer',
  'oracle', 'description', 'status', 'expected', 'observed', 'error', 'review_state',
  'provider', 'provider_api_version', 'artifact_sha256', 'redaction_policy', 'redactions',
  'provenance',
];
const PROVENANCE_FIELDS: readonly (keyof Provenance)[] = [
  'source_commit', 'source_dirty', 'harness_commit', 'dependency_lock_sha256', 'runtime',
  'started_at', 'ended_at',
];

// ---------- Redaction ----------

export const MAX_TEXT = 256;

const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 && (d *= 2) > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
};

// Order matters: provider keys before the generic long-hex rule.
const PATTERNS: readonly [kind: string, pattern: RegExp][] = [
  ['provider-key', /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}|\bwhsec_[A-Za-z0-9]{8,}|\bsq0[a-z]{3}-[A-Za-z0-9_-]{8,}|\bEAAA[A-Za-z0-9_-]{16,}/g],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi],
  ['secret', /\b[A-Fa-f0-9]{32,}\b/g],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
];
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;

function scrub(text: string, kinds: Set<string>): string {
  let out = text.replace(CARD, m => {
    if (!luhn(m.replace(/\D/g, ''))) return m;
    kinds.add('card-number');
    return '[redacted:card-number]';
  });
  for (const [kind, pattern] of PATTERNS) {
    out = out.replace(pattern, () => {
      kinds.add(kind);
      return `[redacted:${kind}]`;
    });
  }
  return out;
}

/** Replaces card numbers, keys, tokens, long hex secrets and emails, then caps the length. */
export function redactText(text: string): { text: string; redactions: string[] } {
  const kinds = new Set<string>();
  let out = scrub(text, kinds);
  if (out.length > MAX_TEXT) {
    kinds.add('truncated');
    // Scrub again: the cut can expose a new match at the end.
    out = scrub(out.slice(0, MAX_TEXT), kinds);
  }
  return { text: out, redactions: [...kinds].sort() };
}

/** Only scalars are stored. Objects and arrays could carry anything, so they are dropped. */
export function redactValue(value: unknown): { value: Scalar; redactions: string[] } {
  if (value === null || value === undefined) return { value: null, redactions: [] };
  if (typeof value === 'boolean') return { value, redactions: [] };
  if (typeof value === 'number') return { value: Number.isFinite(value) ? value : String(value), redactions: [] };
  if (typeof value === 'string') {
    const r = redactText(value);
    return { value: r.text, redactions: r.redactions };
  }
  return { value: '[redacted:non-scalar]', redactions: ['non-scalar'] };
}

// ---------- Building ----------

export type RawOutcome = { expected: unknown; observed: unknown } | { error: string };

type CheckMeta = Pick<Check, 'id' | 'version' | 'control' | 'layer' | 'oracle' | 'description'>;

export function evidenceRecord(
  check: CheckMeta,
  subject: Pick<SubjectAdapter, 'id' | 'provider'>,
  context: RunContext,
  outcome: RawOutcome,
  times?: { started: Date; ended: Date },
): EvidenceRecord {
  const errored = 'error' in outcome;
  const expected = errored ? { value: null, redactions: [] } : redactValue(outcome.expected);
  const observed = errored ? { value: null, redactions: [] } : redactValue(outcome.observed);
  const error = errored ? redactText(outcome.error) : null;
  // Decided on the raw values, before redaction. A missing observation is never a pass.
  const pass = !errored && outcome.observed !== null && outcome.observed !== undefined && outcome.observed === outcome.expected;

  if (context.provenance && !times) throw new Error('Provenance requires start and end times');
  return {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    record_id: `${context.runId}/${check.id}@${check.version}`,
    run_id: context.runId,
    subject_id: subject.id,
    authorization_id: context.authorizationId,
    control_id: check.control,
    check_id: check.id,
    check_version: check.version,
    registry_version: REGISTRY_VERSION,
    metric_version: METRIC_VERSION,
    observation_layer: check.layer,
    oracle: check.oracle,
    description: check.description,
    status: errored ? 'unknown' : pass ? 'pass' : 'fail',
    expected: expected.value,
    observed: observed.value,
    error: error ? error.text : null,
    review_state: errored ? 'needs-review' : 'automated',
    provider: subject.provider?.name ?? null,
    provider_api_version: subject.provider?.apiVersion ?? null,
    artifact_sha256: null,
    redaction_policy: REDACTION_POLICY,
    redactions: [...new Set([...expected.redactions, ...observed.redactions, ...(error?.redactions ?? [])])].sort(),
    provenance: context.provenance && times
      ? { ...context.provenance, started_at: times.started.toISOString(), ended_at: times.ended.toISOString() }
      : null,
  };
}

// ---------- Validation ----------

const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LAYERS: readonly string[] = ['http-api', 'backend-and-provider'] satisfies Layer[];
const ORACLES: readonly string[] = ['fulfillment-records', 'http-response', 'retained-artifacts', 'audit-trail'] satisfies Oracle[];

const isScalar = (v: unknown): v is Scalar => v === null || ['number', 'boolean', 'string'].includes(typeof v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Returns every problem found; an empty list means the record is valid. It checks shape, the
 * "unknown is never pass" rules and that no stored text would be changed by redaction. It does
 * not authenticate the record: a valid record can still be untrue.
 */
export function validateEvidence(record: unknown, options: { requireProvenance?: boolean } = {}): string[] {
  if (!isObject(record)) return ['record must be an object'];
  const errors: string[] = [];
  const r = record;
  const fail = (message: string) => { errors.push(message); };

  for (const key of Object.keys(r)) if (!(FIELDS as readonly string[]).includes(key)) fail(`${key}: not an allowed field`);
  for (const key of FIELDS) if (!(key in r)) fail(`${key}: missing`);
  if (errors.length) return errors;

  const text = (key: string, value: unknown, nullable = false) => {
    if (value === null && nullable) return;
    if (typeof value !== 'string' || !value) return fail(`${key}: must be a non-empty string`);
    if (redactText(value).text !== value) fail(`${key}: contains text the redaction policy removes`);
  };

  if (r.schema_version !== EVIDENCE_SCHEMA_VERSION) fail(`schema_version: expected ${EVIDENCE_SCHEMA_VERSION}`);
  if (r.redaction_policy !== REDACTION_POLICY) fail(`redaction_policy: expected ${REDACTION_POLICY}`);
  for (const key of ['run_id', 'subject_id', 'authorization_id', 'control_id', 'check_id', 'registry_version', 'metric_version', 'description'] as const) text(key, r[key]);
  text('error', r.error, true);
  text('provider', r.provider, true);
  text('provider_api_version', r.provider_api_version, true);
  if (!Number.isInteger(r.check_version) || (r.check_version as number) < 1) fail('check_version: must be a positive integer');
  if (r.record_id !== `${r.run_id}/${r.check_id}@${r.check_version}`) fail('record_id: must be <run_id>/<check_id>@<check_version>');
  if (!LAYERS.includes(r.observation_layer as string)) fail('observation_layer: unknown layer');
  if (!ORACLES.includes(r.oracle as string)) fail('oracle: unknown oracle');
  if (!['automated', 'needs-review', 'adjudicated'].includes(r.review_state as string)) fail('review_state: invalid');
  if (r.artifact_sha256 !== null && !(typeof r.artifact_sha256 === 'string' && SHA256.test(r.artifact_sha256))) fail('artifact_sha256: must be a SHA-256 hex digest or null');
  if (!Array.isArray(r.redactions) || r.redactions.some(k => typeof k !== 'string')) fail('redactions: must be a list of strings');

  for (const key of ['expected', 'observed'] as const) {
    const v = r[key];
    if (!isScalar(v)) fail(`${key}: must be a scalar`);
    else if (typeof v === 'number' && !Number.isFinite(v)) fail(`${key}: must be finite`);
    else if (typeof v === 'string' && redactText(v).text !== v) fail(`${key}: contains text the redaction policy removes`);
  }

  // Unknown is never pass.
  if (r.status === 'pass') {
    if (r.error !== null) fail('status: a pass cannot carry an error');
    if (r.observed === null) fail('status: a pass needs an observation');
    if (r.observed !== r.expected) fail('status: a pass needs observed to equal expected');
  } else if (r.status === 'fail') {
    if (r.error !== null) fail('status: a check that errored is unknown, not fail');
    if (r.observed === r.expected && Array.isArray(r.redactions) && !r.redactions.length) fail('status: a fail needs observed to differ from expected');
  } else if (r.status === 'unknown') {
    if (r.error === null) fail('status: unknown needs the error that stopped the check');
    if (r.expected !== null || r.observed !== null) fail('status: unknown carries no expected or observed value');
    if (r.review_state === 'automated') fail('review_state: unknown needs review');
  } else {
    fail('status: must be pass, fail or unknown');
  }

  const p = r.provenance;
  if (p === null) {
    if (options.requireProvenance) fail('provenance: required');
  } else if (!isObject(p)) {
    fail('provenance: must be an object or null');
  } else {
    for (const key of Object.keys(p)) if (!(PROVENANCE_FIELDS as readonly string[]).includes(key)) fail(`provenance.${key}: not an allowed field`);
    for (const key of ['source_commit', 'harness_commit'] as const) {
      if (!(typeof p[key] === 'string' && SHA1.test(p[key]))) fail(`provenance.${key}: must be a full commit SHA`);
    }
    if (typeof p.source_dirty !== 'boolean') fail('provenance.source_dirty: must be a boolean');
    if (!(typeof p.dependency_lock_sha256 === 'string' && SHA256.test(p.dependency_lock_sha256))) fail('provenance.dependency_lock_sha256: must be a SHA-256 hex digest');
    text('provenance.runtime', p.runtime);
    for (const key of ['started_at', 'ended_at'] as const) {
      if (!(typeof p[key] === 'string' && TIMESTAMP.test(p[key]) && !Number.isNaN(Date.parse(p[key])))) fail(`provenance.${key}: must be an ISO 8601 UTC timestamp`);
    }
    if (typeof p.started_at === 'string' && typeof p.ended_at === 'string' && p.ended_at < p.started_at) fail('provenance.ended_at: before started_at');
  }
  return errors;
}

export function assertEvidence(record: unknown, options?: { requireProvenance?: boolean }): asserts record is EvidenceRecord {
  const errors = validateEvidence(record, options);
  if (errors.length) throw new Error('Invalid evidence record:\n' + errors.join('\n'));
}
