// Reads what ties a run to the code that produced it: commit, working-tree state, dependency
// lock and runtime. The lab's subjects live in this repository, so subject and harness share
// a commit. Throws outside a git checkout: provenance is recorded, never guessed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { RunProvenance } from '@pias/checks';

const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

export function collectProvenance(root: string): RunProvenance {
  const commit = git(root, 'rev-parse', 'HEAD');
  return {
    source_commit: commit,
    source_dirty: git(root, 'status', '--porcelain') !== '',
    harness_commit: commit,
    dependency_lock_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'package-lock.json'))).digest('hex'),
    runtime: `node-${process.version}`,
  };
}
