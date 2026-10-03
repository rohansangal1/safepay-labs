import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', '..');
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test('the public folder holds none of the portal files and no data', () => {
  const publicFiles = walk(path.join(root, 'public')).map(f => path.relative(path.join(root, 'public'), f));
  const portalFiles = new Set(walk(path.join(root, 'site')).map(f => path.relative(path.join(root, 'site'), f)));

  // index.html exists on both sides by design; every other portal path must be absent.
  const overlap = publicFiles.filter(f => f !== 'index.html' && portalFiles.has(f));
  assert.deepEqual(overlap, []);
  assert.deepEqual(publicFiles.filter(f => f.startsWith('data' + path.sep) || f.endsWith('.json')), []);
});

test('every image and font the landing page uses is vendored and listed in SOURCES.md', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/landing.css'), 'utf8');
  const sources = fs.readFileSync(path.join(root, 'public/assets/SOURCES.md'), 'utf8');
  const refs = new Set<string>();
  for (const m of (html + css).matchAll(/assets\/([\w./-]+\.(?:svg|webp|woff2|png|jpg))/g)) refs.add(m[1]);
  assert.ok(refs.size > 0);
  for (const ref of refs) {
    assert.ok(fs.existsSync(path.join(root, 'public/assets', ref)), `missing asset: ${ref}`);
    const dir = ref.split('/')[0];
    const listed = sources.includes('`' + ref + '`') || sources.includes('`' + dir + '/*.svg`');
    assert.ok(listed, `asset not in SOURCES.md: ${ref}`);
  }
  // No external origins anywhere: the CSP would block them.
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(css), 'landing.css references an external URL');
  assert.ok(!/<(script|style)[^>]*>[^<]/.test(html.replace(/<script type="module" src="landing.js"><\/script>/, '')), 'inline script or style');
});
