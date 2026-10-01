// The public roadmap: progress per phase and nothing else. Milestone titles and details stay in
// the researcher portal (site/data/milestones.json), so this is the only part the landing page sees.

export interface Milestone {
  id: number;
  title: string;
  detail: string;
  phase: string;
  status: string;
}

export interface PhaseProgress {
  phase: string;
  done: number;
  total: number;
}

export function publicRoadmap(milestones: Milestone[]): PhaseProgress[] {
  const phases = new Map<string, PhaseProgress>();
  for (const m of milestones) {
    const p = phases.get(m.phase) ?? { phase: m.phase, done: 0, total: 0 };
    p.total += 1;
    if (m.status === 'done') p.done += 1;
    phases.set(m.phase, p);
  }
  return [...phases.values()].sort((a, b) => a.phase.localeCompare(b.phase));
}
