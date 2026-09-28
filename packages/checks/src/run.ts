// Runs registered checks against a subject and folds them into PIAS control results.
import type { ControlResult, Results } from '@pias/core';
import type { OpenSubject } from './adapter.ts';
import type { Check, Layer, Oracle } from './registry.ts';

export interface CheckOutcome {
  id: string;
  version: number;
  layer: Layer;
  oracle: Oracle;
  description: string;
  expected: unknown;
  observed: unknown;
  pass: boolean;
  /** Set when the check could not run to completion. Its outcome is then unknown, never pass. */
  error?: string;
}

export interface CheckedControl extends ControlResult {
  checks: CheckOutcome[];
}

/**
 * Opens a fresh subject per control so checks for one control can't disturb another's state.
 * A control fails if any check fails, is unknown if a check errored and none failed, and
 * passes only when every check ran and passed.
 */
export async function runChecks(checks: readonly Check[], open: OpenSubject): Promise<Results & Record<string, CheckedControl>> {
  const byControl = new Map<string, Check[]>();
  for (const c of checks) byControl.set(c.control, [...(byControl.get(c.control) ?? []), c]);

  const results: Record<string, CheckedControl> = {};
  for (const [control, group] of byControl) {
    const subject = await open();
    try {
      const outcomes: CheckOutcome[] = [];
      for (const c of group) {
        const base = { id: c.id, version: c.version, layer: c.layer, oracle: c.oracle, description: c.description };
        try {
          const { expected, observed } = await c.run(subject);
          outcomes.push({ ...base, expected, observed, pass: observed === expected });
        } catch (err) {
          outcomes.push({ ...base, expected: null, observed: null, pass: false, error: String((err as Error)?.message ?? err) });
        }
      }
      const passed = outcomes.filter(o => o.pass).length;
      const failed = outcomes.some(o => !o.pass && !o.error);
      const errored = outcomes.some(o => o.error);
      results[control] = failed
        ? { status: 'fail', evidence: `${subject.id}:${control}:${passed}/${outcomes.length}-checks-passed`, checks: outcomes }
        : errored
          ? { status: 'unknown', checks: outcomes }
          : { status: 'pass', evidence: `${subject.id}:${control}:${passed}/${outcomes.length}-checks-passed`, checks: outcomes };
    } finally {
      await subject.close();
    }
  }
  return results;
}
