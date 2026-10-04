// Runs the harm oracle against the owned reference checkout and its seeded defects, and writes
// which defects cause which money or state harm. Kept apart from assess.ts and data/runs: harm
// outcomes validate the score and never feed it (ADR 002).
import fs from 'node:fs';
import path from 'node:path';
import { HARM_TYPES, SCENARIOS, runOracle } from '@pias/oracle';
import { DEFECTS, type Defect } from './app.ts';
import { openReference } from './adapter.ts';

const OUTPUT = path.join(import.meta.dirname, '..', '..', '..', 'data', 'harm', 'lab-reference.json');

export const measureHarm = (defects: string[] = []) => runOracle(SCENARIOS, () => openReference(defects));

async function main() {
  // Same run IDs as assess.ts, so a run's harm outcome can be joined to its score.
  const baseline = { id: 'LAB-0', label: 'Baseline', defects: [] as string[] };
  const seeded = (Object.keys(DEFECTS) as Defect[]).map((d, i) => ({ id: `LAB-${i + 1}`, label: `Seeded: ${d}`, defects: [d] }));
  const runs = [];
  for (const v of [baseline, ...seeded]) runs.push({ ...v, harm: await measureHarm(v.defects) });

  const output = {
    kind: 'harm-run',
    target: 'owned reference checkout (local, fake provider)',
    note: 'Outcomes read from the provider ledger and the fulfillment records. Never an input to the score.',
    runs,
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');

  for (const r of runs) {
    const seen = HARM_TYPES.filter(t => r.harm.counts[t]).map(t => `${t} ×${r.harm.counts[t]}`);
    const unclean = r.harm.scenarios.filter(s => s.status !== 'ran').map(s => `${s.id} ${s.status}`);
    console.log(`${r.id.padEnd(6)} ${r.label.padEnd(30)} ${seen.length ? seen.join(', ') : r.harm.any_harm === false ? 'no harm' : 'unknown'}${unclean.length ? `  (${unclean.join(', ')})` : ''}`);
  }
  console.log(`\nWrote ${path.relative(process.cwd(), OUTPUT)}`);
}

if (process.argv[1] === import.meta.filename) {
  main().catch(err => { console.error(err); process.exit(1); });
}
