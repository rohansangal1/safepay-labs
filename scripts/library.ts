// Research library: the project's knowledge base of related work and primary sources.
// Pure functions only; scripts/update-library.ts does the network calls.
// Automated finds enter as 'candidate' and only a person moves them to 'included' or 'excluded'.

export type Status = 'included' | 'candidate' | 'excluded';
export type Flag = 'new-version' | 'link-broken';

export interface Entry {
  id: string;
  status: Status;
  category: string;
  source: string;
  title: string;
  note: string;
  url: string;
  authors?: string;
  abstract?: string;
  reason?: string; // why it was excluded; keeps the screening log in one place
  track_citations?: boolean;
  arxiv?: { version: number; updated: string };
  found?: { date: string; via: string };
  flags?: Flag[];
}

export interface Found {
  id: string;
  title: string;
  url: string;
  source: string;
  authors?: string;
  abstract?: string;
  arxiv?: { version: number; updated: string };
}

const ABSTRACT_LIMIT = 600;

export const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const arxivId = (url: string) => url.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/)?.[1] ?? null;
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const clip = (s: string) => (s.length > ABSTRACT_LIMIT ? s.slice(0, ABSTRACT_LIMIT).replace(/\s+\S*$/, '') + '…' : s);
const authorList = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(', ')} et al.` : names.join(', '));

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? squash(decodeXml(m[1])) : '';
};

// Parses an arXiv API Atom feed (https://info.arxiv.org/help/api/user-manual.html).
export function parseArxivFeed(xml: string): Found[] {
  const out: Found[] = [];
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const m = tag(entry, 'id').match(/abs\/(\d{4}\.\d{4,5})v(\d+)$/);
    if (!m) continue;
    const [, id, version] = m;
    const published = tag(entry, 'published');
    const names = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map(a => squash(decodeXml(a[1])));
    out.push({
      id: 'arxiv:' + id,
      title: tag(entry, 'title'),
      url: `https://arxiv.org/abs/${id}`,
      source: `Preprint ${published.slice(0, 4)}`,
      authors: authorList(names),
      abstract: clip(tag(entry, 'summary')),
      arxiv: { version: Number(version), updated: tag(entry, 'updated').slice(0, 10) },
    });
  }
  return out;
}

// Parses one Semantic Scholar citing paper (Graph API /paper/{id}/citations).
export function fromSemanticScholar(p: any): Found | null {
  if (!p || !p.title) return null;
  const ids = p.externalIds ?? {};
  const year = p.year ? ` ${p.year}` : '';
  const base = {
    title: squash(p.title),
    source: (p.venue ? squash(p.venue) : 'Preprint') + year,
    authors: authorList((p.authors ?? []).map((a: any) => a.name).filter(Boolean)),
    abstract: p.abstract ? clip(squash(p.abstract)) : undefined,
  };
  if (ids.ArXiv) return { ...base, id: 'arxiv:' + ids.ArXiv, url: `https://arxiv.org/abs/${ids.ArXiv}` };
  if (ids.DOI) return { ...base, id: 'doi:' + String(ids.DOI).toLowerCase(), url: `https://doi.org/${ids.DOI}` };
  if (p.paperId) return { ...base, id: 's2:' + p.paperId, url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}` };
  return null;
}

export const mentionsAny = (f: Found, terms: string[]) => {
  const text = `${f.title} ${f.abstract ?? ''}`.toLowerCase();
  return terms.some(t => new RegExp(`\\b${t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text));
};

export function addFlag(e: Entry, flag: Flag) {
  if (!e.flags?.includes(flag)) e.flags = [...(e.flags ?? []), flag];
}

export function removeFlag(e: Entry, flag: Flag) {
  if (!e.flags) return;
  e.flags = e.flags.filter(f => f !== flag);
  if (!e.flags.length) delete e.flags;
}

// Adds finds the library has never seen, under any status, matched by ID or title.
export function addCandidates(library: Entry[], finds: Found[], via: string, date: string): Entry[] {
  const ids = new Set(library.map(e => e.id));
  const titles = new Set(library.map(e => normTitle(e.title)));
  const added: Entry[] = [];
  for (const f of finds) {
    if (ids.has(f.id) || titles.has(normTitle(f.title))) continue;
    const entry: Entry = {
      id: f.id, status: 'candidate', category: 'Paper', source: f.source, title: f.title, note: '', url: f.url,
      ...(f.authors ? { authors: f.authors } : {}),
      ...(f.abstract ? { abstract: f.abstract } : {}),
      ...(f.arxiv ? { arxiv: f.arxiv } : {}),
      found: { date, via },
    };
    library.push(entry);
    added.push(entry);
    ids.add(f.id);
    titles.add(normTitle(f.title));
  }
  return added;
}

// Records the latest arXiv version. A version newer than the one recorded is flagged for re-reading.
export function applyVersion(e: Entry, latest: { version: number; updated: string }): boolean {
  const known = e.arxiv?.version;
  if (known === latest.version) return false;
  e.arxiv = latest;
  if (known !== undefined && latest.version > known && e.status === 'included') {
    addFlag(e, 'new-version');
    return true;
  }
  return false;
}

// One entry per line keeps diffs reviewable line by line.
export function serialize(library: Entry[]): string {
  return '[\n' + library.map(e => '  ' + JSON.stringify(e)).join(',\n') + '\n]\n';
}

export function validate(library: Entry[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const e of library) {
    const where = e.id || e.title || '(no id)';
    if (!e.id || seen.has(e.id)) errors.push(`${where}: missing or duplicate id`);
    seen.add(e.id);
    if (!['included', 'candidate', 'excluded'].includes(e.status)) errors.push(`${where}: unknown status ${e.status}`);
    for (const k of ['category', 'source', 'title', 'url'] as const) if (!e[k]) errors.push(`${where}: missing ${k}`);
    if (e.status === 'included' && !e.note) errors.push(`${where}: included entries need a note`);
    if (e.status === 'excluded' && !e.reason) errors.push(`${where}: excluded entries need a reason`);
  }
  return errors;
}
