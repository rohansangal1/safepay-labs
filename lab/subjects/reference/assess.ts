// Runs the registered PIAS checks against the owned reference checkout and its seeded defects.
// The checks live in packages/checks; this file only picks the subject and writes the results.
// The oracle is the checkout's own records (fulfillments, logs, stored rows, audit trail), not
// its HTTP responses, except where a check is about the responses themselves.
//
//   node assess.ts             committed fixture (data/runs), reproducible: no commit or timestamps
//   node assess.ts --evidence  full-provenance evidence records (data/evidence, git-ignored)
import fs from 'node:fs';
import path from 'node:path';
import { score, controls, METRIC_VERSION } from '@pias/core';
import { CHECKS, EVIDENCE_SCHEMA_VERSION, REDACTION_POLICY, REGISTRY_VERSION, runChecks, type RunContext } from '@pias/checks';
import { DEFECTS, type Defect } from './app.ts';
import { openReference } from './adapter.ts';
import { collectProvenance } from '../../provenance.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const OUTPUT = path.join(ROOT, 'data', 'runs', 'lab-reference.json');
const EVIDENCE_DIR = path.join(ROOT, 'data', 'evidence');
/** Scope authorization for runs against software in this repository (docs/SAFETY.md). */
export const AUTHORIZATION_ID = 'owned-lab';

export async function assess(defects: string[] = [], context: RunContext = { runId: 'adhoc', authorizationId: AUTHORIZATION_ID }) {
  const results = await runChecks(CHECKS, () => openReference(defects), context);
  return { results, score: score(controls, results) };
}

async function main() {
  const withProvenance = process.argv.includes('--evidence');
  const provenance = withProvenance ? collectProvenance(ROOT) : undefined;
  // Run IDs must stay unique across reruns once records carry provenance.
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const runId = (id: string) => (withProvenance ? `${id}-${stamp}` : id);

  const baseline = { id: 'LAB-0', label: 'Baseline', defects: [] as string[] };
  const seeded = (Object.keys(DEFECTS) as Defect[]).map((d, i) => ({ id: `LAB-${i + 1}`, label: `Seeded: ${d}`, defects: [d], description: DEFECTS[d] }));
  const runs = [];
  for (const v of [baseline, ...seeded]) {
    runs.push({ ...v, ...(await assess(v.defects, { runId: runId(v.id), authorizationId: AUTHORIZATION_ID, provenance })) });
  }

  let written: string;
  if (withProvenance) {
    const records = runs.flatMap(r => Object.values(r.results).flatMap(c => c.records));
    written = path.join(EVIDENCE_DIR, `lab-reference-${stamp}.jsonl`);
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(written, records.map(r => JSON.stringify(r)).join('\n') + '\n');
    if (provenance?.source_dirty) console.warn('Working tree has uncommitted changes; records are marked source_dirty.');
  } else {
    const output = {
      kind: 'lab-run',
      target: 'owned reference checkout (local, fake provider)',
      metric_version: METRIC_VERSION,
      checks_version: REGISTRY_VERSION,
      evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
      redaction_policy: REDACTION_POLICY,
      note: 'Controls without checks are left unknown. These are lab fixtures, not merchant assessments.',
      runs,
    };
    written = OUTPUT;
    fs.writeFileSync(written, JSON.stringify(output, null, 2) + '\n');
  }

  for (const r of runs) {
    const failed = Object.entries(r.results).filter(([, x]) => x.status === 'fail').map(([c]) => c);
    console.log(`${r.id.padEnd(6)} ${r.label.padEnd(30)} range ${Math.round(r.score.lower ?? 0)}–${Math.round(r.score.upper ?? 0)}  ${r.score.gate}${failed.length ? '  failed: ' + failed.join(', ') : ''}`);
  }
  console.log(`\nWrote ${path.relative(process.cwd(), written)}`);
}

if (process.argv[1] === import.meta.filename) {
  main().catch(err => { console.error(err); process.exit(1); });
}
