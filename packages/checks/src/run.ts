// Runs registered checks against a subject and folds them into PIAS control results.
import type { ControlResult, Results } from '@pias/core';
import type { OpenSubject } from './adapter.ts';
import { assertEvidence, evidenceRecord, type EvidenceRecord, type RawOutcome, type RunContext } from './evidence.ts';
import type { Check } from './registry.ts';

export interface CheckedControl extends ControlResult {
  /** One evidence record per check that ran for this control. */
  records: EvidenceRecord[];
}

/**
 * Opens a fresh subject per control so checks for one control can't disturb another's state.
 * A control fails if any check fails, is unknown if a check errored and none failed, and
 * passes only when every check ran and passed. Every outcome is stored as a validated
 * evidence record; a record the redaction policy rejects stops the run.
 */
export async function runChecks(checks: readonly Check[], open: OpenSubject, context: RunContext): Promise<Results & Record<string, CheckedControl>> {
  const byControl = new Map<string, Check[]>();
  for (const c of checks) byControl.set(c.control, [...(byControl.get(c.control) ?? []), c]);
  const now = context.now ?? (() => new Date());

  const results: Record<string, CheckedControl> = {};
  for (const [control, group] of byControl) {
    const subject = await open();
    try {
      const records: EvidenceRecord[] = [];
      for (const c of group) {
        const started = now();
        let outcome: RawOutcome;
        try {
          outcome = await c.run(subject);
        } catch (err) {
          outcome = { error: String((err as Error)?.message ?? err) || 'unknown error' };
        }
        const record = evidenceRecord(c, subject, context, outcome, { started, ended: now() });
        assertEvidence(record, { requireProvenance: Boolean(context.provenance) });
        records.push(record);
      }
      const passed = records.filter(r => r.status === 'pass').length;
      const failed = records.some(r => r.status === 'fail');
      const errored = records.some(r => r.status === 'unknown');
      results[control] = failed
        ? { status: 'fail', evidence: `${subject.id}:${control}:${passed}/${records.length}-checks-passed`, records }
        : errored
          ? { status: 'unknown', records }
          : { status: 'pass', evidence: `${subject.id}:${control}:${passed}/${records.length}-checks-passed`, records };
    } finally {
      await subject.close();
    }
  }
  return results;
}
