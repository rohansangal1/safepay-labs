// Refreshes data/library.json: new arXiv papers on the project's topics, new papers citing
// tracked work, new versions of tracked preprints and dead links. Runs daily in
// .github/workflows/library.yml, which opens a pull request for a person to review.
// Usage: node scripts/update-library.ts [--dry-run] [--summary <file>]
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  addCandidates, addFlag, applyVersion, arxivId, fromSemanticScholar, mentionsAny, parseArxivFeed,
  removeFlag, serialize, validate, type Entry, type Found,
} from './library.ts';

const root = path.join(import.meta.dirname, '..');
const LIBRARY = path.join(root, 'data', 'library.json');
const QUERIES = path.join(root, 'data', 'library-queries.json');
const USER_AGENT = 'payment-integration-lab library updater (research; https://github.com/rohansangal1/payment-integration-lab)';
const ARXIV_DELAY_MS = 3100; // arXiv asks for one request every three seconds
const S2_MAX_CITATIONS = 1000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const summaryPath = args.includes('--summary') ? args[args.indexOf('--summary') + 1] : null;
const today = new Date().toISOString().slice(0, 10);

const library: Entry[] = JSON.parse(fs.readFileSync(LIBRARY, 'utf8'));
const config: { arxiv: { name: string; query: string; must: string[][] }[]; per_query: number; citation_terms: string[] } =
  JSON.parse(fs.readFileSync(QUERIES, 'utf8'));
const problems: string[] = [];
const report = { added: [] as Entry[], versions: [] as Entry[], broken: [] as Entry[], restored: [] as Entry[] };

async function get(url: string, headers: Record<string, string> = {}, retries = 3): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
      if ((res.status !== 429 && res.status < 500) || attempt >= retries) return res;
    } catch (err) {
      if (attempt >= retries) throw err;
    }
    await sleep(5000 * 2 ** attempt);
  }
}

async function arxiv(params: Record<string, string>): Promise<Found[]> {
  const res = await get('https://export.arxiv.org/api/query?' + new URLSearchParams(params));
  await sleep(ARXIV_DELAY_MS);
  if (!res.ok) throw new Error(`arXiv ${res.status}`);
  return parseArxivFeed(await res.text());
}

async function searchArxiv() {
  for (const q of config.arxiv) {
    try {
      const finds = (await arxiv({ search_query: q.query, sortBy: 'submittedDate', sortOrder: 'descending', max_results: String(config.per_query) }))
        .filter(f => q.must.every(terms => mentionsAny(f, terms)));
      report.added.push(...addCandidates(library, finds, `arXiv search: ${q.name}`, today));
    } catch (err) {
      problems.push(`arXiv search "${q.name}": ${(err as Error).message}`);
    }
  }
}

async function trackVersions() {
  const tracked = library.filter(e => e.status !== 'excluded' && arxivId(e.url));
  if (!tracked.length) return;
  try {
    const latest = new Map((await arxiv({ id_list: tracked.map(e => arxivId(e.url)).join(','), max_results: String(tracked.length) }))
      .map(f => [f.id, f.arxiv!]));
    for (const e of tracked) {
      const v = latest.get('arxiv:' + arxivId(e.url));
      if (v && applyVersion(e, v)) report.versions.push(e);
    }
  } catch (err) {
    problems.push(`arXiv versions: ${(err as Error).message}`);
  }
}

async function citingPapers() {
  const headers: Record<string, string> = process.env.S2_API_KEY ? { 'x-api-key': process.env.S2_API_KEY } : {};
  for (const seed of library.filter(e => e.track_citations && e.status === 'included')) {
    const id = arxivId(seed.url) ? 'arXiv:' + arxivId(seed.url) : null;
    if (!id) continue;
    const finds: Found[] = [];
    try {
      for (let offset = 0; offset < S2_MAX_CITATIONS; offset += 100) {
        const url = `https://api.semanticscholar.org/graph/v1/paper/${id}/citations?` +
          new URLSearchParams({ fields: 'title,abstract,year,venue,externalIds,url,authors', limit: '100', offset: String(offset) });
        const res = await get(url, headers);
        if (!res.ok) throw new Error(`Semantic Scholar ${res.status}`);
        const page = await res.json() as { data?: { citingPaper: unknown }[]; next?: number };
        for (const c of page.data ?? []) {
          const f = fromSemanticScholar(c.citingPaper);
          if (f && mentionsAny(f, config.citation_terms)) finds.push(f);
        }
        await sleep(1100);
        if (page.next === undefined) break;
      }
    } catch (err) {
      problems.push(`citations of "${seed.title}": ${(err as Error).message}`);
    }
    report.added.push(...addCandidates(library, finds, `cites: ${seed.title}`, today));
  }
}

// Only 404 and 410 count as dead: many publishers answer bots with 403 or a challenge page.
async function checkLinks() {
  for (const e of library.filter(e => e.status === 'included' && !arxivId(e.url))) {
    try {
      const res = await get(e.url, {}, 1);
      await res.body?.cancel();
      if (res.status === 404 || res.status === 410) {
        if (!e.flags?.includes('link-broken')) report.broken.push(e);
        addFlag(e, 'link-broken');
      } else if (res.ok && e.flags?.includes('link-broken')) {
        removeFlag(e, 'link-broken');
        report.restored.push(e);
      }
    } catch {
      // Timeouts and network errors are too noisy to flag on; the next run tries again.
    }
  }
}

function summary(): string {
  const link = (e: Entry) => `[${e.title}](${e.url})`;
  const lines = [`## Library update, ${today}`, ''];
  if (report.added.length) {
    lines.push(`### ${report.added.length} new candidate${report.added.length === 1 ? '' : 's'}`, '');
    for (const e of report.added) lines.push(`- ${link(e)} (${e.source}${e.authors ? `; ${e.authors}` : ''}), found via ${e.found!.via}`);
    lines.push('');
  }
  if (report.versions.length) {
    lines.push('### New versions of included preprints', '');
    for (const e of report.versions) lines.push(`- ${link(e)}: now v${e.arxiv!.version} (${e.arxiv!.updated}). Re-read and remove the \`new-version\` flag.`);
    lines.push('');
  }
  if (report.broken.length || report.restored.length) {
    lines.push('### Links', '');
    for (const e of report.broken) lines.push(`- Broken (404/410): ${link(e)}`);
    for (const e of report.restored) lines.push(`- Working again: ${link(e)}`);
    lines.push('');
  }
  if (problems.length) {
    lines.push('### Sources that failed this run', '', ...problems.map(p => `- ${p}`), '');
  }
  lines.push('### How to review',
    'In `data/library.json`, set each candidate\'s `status` to `included` (add a `note` and fix `category`) or `excluded` (add a `reason`). ' +
    'Excluded entries stay in the file so they are never suggested again. Candidates can also be merged as they are and screened later; ' +
    'the site lists them under **Unreviewed**. `npm run build:site` checks the file.');
  return lines.join('\n') + '\n';
}

await searchArxiv();
await trackVersions();
await citingPapers();
await checkLinks();

const errors = validate(library);
if (errors.length) {
  console.error('Library is invalid:\n' + errors.join('\n'));
  process.exit(1);
}
const text = summary();
if (summaryPath) fs.writeFileSync(summaryPath, text);
if (!dryRun) fs.writeFileSync(LIBRARY, serialize(library));
console.log(text);
console.log(dryRun ? 'Dry run: data/library.json not written.' : 'Wrote data/library.json');
