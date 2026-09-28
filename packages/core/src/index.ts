import { readFileSync } from 'node:fs';
import type { Control } from './score.ts';

export * from './score.ts';

/** PIAS control catalog, version-locked with the metric. */
export const METRIC_VERSION = '0.1';
export const controls: Control[] = JSON.parse(readFileSync(new URL('./controls.json', import.meta.url), 'utf8'));
