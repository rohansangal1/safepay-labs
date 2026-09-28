// PIAS scoring engine. Pure and dependency-free so the same file runs in Node and,
// after type stripping, in the browser (see scripts/build-site.ts).

export type Status = 'pass' | 'fail' | 'unknown' | 'na';
export type Gate = 'assessed' | 'insufficient-evidence' | 'critical-failure' | 'not-applicable';

export interface Control {
  id: string;
  title: string;
  weight: number;
  critical: boolean;
  description?: string;
}

export interface ControlResult {
  status: Status;
  /** Required for pass/fail: a reference to the evidence behind the outcome. */
  evidence?: string;
  /** Required for 'na': N/A must be reviewed and justified. */
  reviewed?: boolean;
  rationale?: string;
  [extra: string]: unknown;
}

export type Results = Record<string, ControlResult>;

export interface Score {
  /** Conservative bound: passed weight / applicable weight, 0–100. */
  lower: number | null;
  /** Optimistic bound: (passed + unknown) / applicable weight, 0–100. */
  upper: number | null;
  /** Pass rate among assessed controls; null when nothing was assessed. */
  observed: number | null;
  /** Assessed weight / applicable weight, 0–100. */
  coverage: number;
  gate: Gate;
  criticalFailures: string[];
  criticalUnknown: string[];
}

/** Coverage below this (percent) yields insufficient evidence. Draft convention, not a standard. */
export const COVERAGE_THRESHOLD = 80;

const STATUSES: readonly Status[] = ['pass', 'fail', 'unknown', 'na'];

export function score(controls: readonly Control[], results: Results): Score {
  const ids = new Set(controls.map(c => c.id));
  if (!controls.length || ids.size !== controls.length) throw new Error('Invalid control catalog');
  for (const key of Object.keys(results)) {
    if (!ids.has(key)) throw new Error('Unknown control: ' + key);
  }

  let total = 0;
  let pass = 0;
  let fail = 0;
  let unknown = 0;
  const criticalFailures: string[] = [];
  const criticalUnknown: string[] = [];

  for (const c of controls) {
    if (!Number.isFinite(c.weight) || c.weight <= 0) throw new Error('Weights must be positive');
    const r: ControlResult = results[c.id] ?? { status: 'unknown' };
    if (!STATUSES.includes(r.status)) throw new Error('Invalid status');

    if (r.status === 'na') {
      if (!r.rationale || !r.reviewed) throw new Error('N/A requires reviewed rationale');
      continue;
    }
    total += c.weight;
    if (r.status === 'pass' || r.status === 'fail') {
      if (!r.evidence) throw new Error('Assessed controls require evidence');
      if (r.status === 'pass') pass += c.weight;
      else fail += c.weight;
    } else {
      unknown += c.weight;
    }
    if (c.critical && r.status === 'fail') criticalFailures.push(c.id);
    if (c.critical && r.status === 'unknown') criticalUnknown.push(c.id);
  }

  if (!total) {
    return { lower: null, upper: null, observed: null, coverage: 0, gate: 'not-applicable', criticalFailures, criticalUnknown };
  }

  const coverage = (100 * (pass + fail)) / total;
  const gate: Gate = criticalFailures.length
    ? 'critical-failure'
    : criticalUnknown.length || coverage < COVERAGE_THRESHOLD
      ? 'insufficient-evidence'
      : 'assessed';

  return {
    lower: (100 * pass) / total,
    upper: (100 * (pass + unknown)) / total,
    observed: pass + fail ? (100 * pass) / (pass + fail) : null,
    coverage,
    gate,
    criticalFailures,
    criticalUnknown,
  };
}
