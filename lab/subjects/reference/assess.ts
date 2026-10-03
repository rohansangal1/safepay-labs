// Runs the registered PIAS checks against the owned reference checkout and its seeded defects.
// The checks live in packages/checks; this file only picks the subject and writes the results.
// The oracle is the checkout's own fulfillment records, not the HTTP responses.
import fs from 'node:fs';
import path from 'node:path';
import { score, controls, METRIC_VERSION } from '@pias/core';
import { CHECKS, REGISTRY_VERSION, runChecks } from '@pias/checks';
import { DEFECTS, type Defect } from './app.ts';
import { openReference } from './adapter.ts';

const OUTPUT = path.join(import.meta.dirname, '..', '..', '..', 'data', 'runs', 'lab-reference.json');

export async function assess(defects: string[] = []) {
  const results = await runChecks(CHECKS, () => openReference(defects));
  return { results, score: score(controls, results) };
}

async function main() {
  const baseline = { id: 'LAB-0', label: 'Baseline', defects: [] as string[] };
  const seeded = (Object.keys(DEFECTS) as Defect[]).map((d, i) => ({ id: `LAB-${i + 1}`, label: `Seeded: ${d}`, defects: [d], description: DEFECTS[d] }));
  const runs = [];
  for (const v of [baseline, ...seeded]) runs.push({ ...v, ...(await assess(v.defects)) });

  const output = {
    kind: 'lab-run',
    target: 'owned reference checkout (local, fake provider)',
    metric_version: METRIC_VERSION,
    checks_version: REGISTRY_VERSION,
    note: 'Controls without checks are left unknown. These are lab fixtures, not merchant assessments.',
    runs,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');

  for (const r of runs) {
    const failed = Object.entries(r.results).filter(([, x]) => x.status === 'fail').map(([c]) => c);
    console.log(`${r.id.padEnd(6)} ${r.label.padEnd(30)} range ${Math.round(r.score.lower ?? 0)}–${Math.round(r.score.upper ?? 0)}  ${r.score.gate}${failed.length ? '  failed: ' + failed.join(', ') : ''}`);
  }
  console.log(`\nWrote ${path.relative(process.cwd(), OUTPUT)}`);
}

if (process.argv[1] === import.meta.filename) {
  main().catch(err => { console.error(err); process.exit(1); });
}
