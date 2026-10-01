import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { publicRoadmap, type Milestone } from '../roadmap.ts';

const root = path.join(import.meta.dirname, '..', '..');
const m = (id: number, phase: string, status: string): Milestone =>
  ({ id, title: `secret title ${id}`, detail: `secret detail ${id}`, phase, status });

test('public roadmap counts done and total per phase, in phase order', () => {
  const roadmap = publicRoadmap([
    m(1, '1 Measurement core', 'not-started'),
    m(2, '0 Foundation', 'done'),
    m(3, '1 Measurement core', 'done'),
    m(4, '1 Measurement core', 'in-progress'),
  ]);
  assert.deepEqual(roadmap, [
    { phase: '0 Foundation', done: 1, total: 1 },
    { phase: '1 Measurement core', done: 1, total: 3 },
  ]);
});

test('public roadmap carries no milestone titles or details', () => {
  const text = JSON.stringify(publicRoadmap([m(1, '0 Foundation', 'done')]));
  assert.ok(!text.includes('secret'));
});

test('the public folder holds none of the portal files', () => {
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const publicFiles = walk(path.join(root, 'public')).map(f => path.relative(path.join(root, 'public'), f));
  const portalFiles = new Set(walk(path.join(root, 'site')).map(f => path.relative(path.join(root, 'site'), f)));

  // index.html exists on both sides by design; every other portal path must be absent.
  const overlap = publicFiles.filter(f => f !== 'index.html' && portalFiles.has(f));
  assert.deepEqual(overlap, []);
  assert.deepEqual(publicFiles.filter(f => f.startsWith('data' + path.sep)), [path.join('data', 'roadmap.json')]);
});
