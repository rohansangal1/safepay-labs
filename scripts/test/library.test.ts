import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  addCandidates, applyVersion, fromSemanticScholar, mentionsAny, parseArxivFeed, serialize, validate, type Entry,
} from '../library.ts';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>arXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2609.01234v2</id>
    <updated>2026-09-20T10:00:00Z</updated>
    <published>2026-09-02T10:00:00Z</published>
    <title>Do Coding Agents Verify
      Webhooks? A Study of Payment &amp; Checkout Code</title>
    <summary>We study payment integrations &lt;written&gt; by agents.</summary>
    <author><name>A. One</name></author><author><name>B. Two</name></author>
    <author><name>C. Three</name></author><author><name>D. Four</name></author>
  </entry>
</feed>`;

const included = (over: Partial<Entry> = {}): Entry => ({
  id: 'arxiv:2502.11844', status: 'included', category: 'Paper', source: 'Preprint 2025',
  title: 'BaxBench: Can LLMs Generate Correct and Secure Backends?', note: 'Closest method.', url: 'https://arxiv.org/abs/2502.11844', ...over,
});

test('parses arXiv entries with versions, decoded text and short author lists', () => {
  const [f] = parseArxivFeed(FEED);
  assert.equal(f.id, 'arxiv:2609.01234');
  assert.equal(f.url, 'https://arxiv.org/abs/2609.01234');
  assert.equal(f.title, 'Do Coding Agents Verify Webhooks? A Study of Payment & Checkout Code');
  assert.equal(f.abstract, 'We study payment integrations <written> by agents.');
  assert.equal(f.authors, 'A. One, B. Two, C. Three et al.');
  assert.equal(f.source, 'Preprint 2026');
  assert.deepEqual(f.arxiv, { version: 2, updated: '2026-09-20' });
});

test('maps Semantic Scholar papers to arXiv, then DOI, then S2 identifiers', () => {
  assert.equal(fromSemanticScholar({ title: 'X', externalIds: { ArXiv: '2601.00001', DOI: '10.1/A' } })?.id, 'arxiv:2601.00001');
  assert.equal(fromSemanticScholar({ title: 'X', externalIds: { DOI: '10.1/ABC' }, venue: 'CCS', year: 2026 })?.source, 'CCS 2026');
  assert.equal(fromSemanticScholar({ title: 'X', externalIds: { DOI: '10.1/ABC' } })?.id, 'doi:10.1/abc');
  assert.equal(fromSemanticScholar({ title: 'X', paperId: 'abc' })?.id, 's2:abc');
  assert.equal(fromSemanticScholar({ paperId: 'abc' }), null);
});

test('citation filter matches whole terms only', () => {
  const f = (title: string) => ({ id: 'x', title, url: 'u', source: 's' });
  assert.equal(mentionsAny(f('Securing checkout flows'), ['checkout']), true);
  assert.equal(mentionsAny(f('Square roots of matrices'), ['payment']), false);
  assert.equal(mentionsAny(f('Recommerce is not commerce'), ['e-commerce']), false);
});

test('never re-adds a known entry, including excluded ones and title matches', () => {
  const library: Entry[] = [
    included(),
    { ...included({ id: 'arxiv:2609.01234', title: 'Old', status: 'excluded', reason: 'Off topic' }) },
  ];
  const finds = [
    ...parseArxivFeed(FEED),
    { id: 'doi:10.1/x', title: 'BaxBench: can LLMs generate correct and secure backends', url: 'u', source: 's' },
    { id: 'doi:10.1/y', title: 'A new one', url: 'https://doi.org/10.1/y', source: 'CCS 2026' },
  ];
  const added = addCandidates(library, finds, 'test', '2026-09-28');
  assert.deepEqual(added.map(e => e.id), ['doi:10.1/y']);
  assert.equal(added[0].status, 'candidate');
  assert.deepEqual(added[0].found, { date: '2026-09-28', via: 'test' });
  assert.deepEqual(validate(library), []);
});

test('a newer version of an included preprint is flagged once recorded', () => {
  const e = included();
  assert.equal(applyVersion(e, { version: 1, updated: '2025-02-01' }), false);
  assert.equal(e.flags, undefined);
  assert.equal(applyVersion(e, { version: 2, updated: '2025-06-01' }), true);
  assert.deepEqual(e.flags, ['new-version']);
  assert.deepEqual(e.arxiv, { version: 2, updated: '2025-06-01' });
});

test('validation requires notes for included and reasons for excluded entries', () => {
  const errors = validate([included({ note: '' }), included({ id: 'b', status: 'excluded' }), included({ id: 'b' })]);
  assert.equal(errors.length, 3);
});

test('the committed library is valid and in canonical form', () => {
  const file = path.join(import.meta.dirname, '..', '..', 'data', 'library.json');
  const text = fs.readFileSync(file, 'utf8');
  const library: Entry[] = JSON.parse(text);
  assert.deepEqual(validate(library), []);
  assert.equal(serialize(library), text);
});
