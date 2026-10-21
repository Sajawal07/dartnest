// Domain-level progression engine. Eligibility is DERIVED from persisted attempt history —
// unlock state is never stored, so it cannot become inconsistent with results.
import type { AppState } from './store';

export const TOTAL_LESSONS = 120;
export const EXAM_PASS = 15;
export const GRAND_PASS = 38;
export const GRAND_PRACTICAL_MIN = 12;

export interface Projection {
  mcqPassed: boolean[]; practicalPassed: boolean[]; complete: boolean[]; unlocked: boolean[];
  grandPassed: boolean[]; grandAvailable: boolean[]; current: number; completedCount: number;
}

type Hist = Pick<AppState, 'mcq' | 'practical' | 'grand'>;
const cache = new WeakMap<object, Projection>();

export function project(s: Hist): Projection {
  const hit = cache.get(s as object);
  if (hit) return hit;
  const mcqPassed = Array(TOTAL_LESSONS + 1).fill(false);
  const practicalPassed = Array(TOTAL_LESSONS + 1).fill(false);
  const grandRaw = Array(25).fill(false);
  for (const a of s.mcq) if (a.total === 20 && a.score >= EXAM_PASS && a.lesson >= 1 && a.lesson <= TOTAL_LESSONS) mcqPassed[a.lesson] = true;
  for (const a of s.practical) if (a.passed && a.lesson >= 1 && a.lesson <= TOTAL_LESSONS) practicalPassed[a.lesson] = true;
  for (const g of s.grand) if (g.total >= GRAND_PASS && g.practical >= GRAND_PRACTICAL_MIN && g.k >= 1 && g.k <= 24) grandRaw[g.k] = true;

  const unlocked = Array(TOTAL_LESSONS + 1).fill(false);
  const complete = Array(TOTAL_LESSONS + 1).fill(false);
  const grandAvailable = Array(25).fill(false);
  const grandPassed = Array(25).fill(false);
  for (let n = 1; n <= TOTAL_LESSONS; n++) {
    if (n === 1) unlocked[n] = true;
    else {
      const prevDone = complete[n - 1];
      const blockGate = (n - 1) % 5 === 0 ? grandPassed[(n - 1) / 5] : true;
      unlocked[n] = prevDone && blockGate;
    }
    // A lesson only counts as complete if it was reachable (prevents inconsistent imported data).
    complete[n] = unlocked[n] && mcqPassed[n] && practicalPassed[n];
    if (n % 5 === 0) {
      const k = n / 5;
      grandAvailable[k] = [0, 1, 2, 3, 4].every((d) => complete[n - d]);
      grandPassed[k] = grandAvailable[k] && grandRaw[k];
    }
  }
  let current = 1;
  for (let n = 1; n <= TOTAL_LESSONS; n++) if (unlocked[n]) current = n;
  if (complete[current] && current % 5 === 0 && !grandPassed[current / 5]) { /* awaiting grand test */ }
  const p: Projection = { mcqPassed, practicalPassed, complete, unlocked, grandPassed, grandAvailable, current, completedCount: complete.filter(Boolean).length };
  cache.set(s as object, p);
  return p;
}

export function lockReason(p: Projection, n: number): string | null {
  if (p.unlocked[n]) return null;
  if (!p.complete[n - 1]) return `Complete lesson ${n - 1} first (pass its 20-question exam with ≥ 15/20 and its practical assessment).`;
  if ((n - 1) % 5 === 0) return `Pass Grand Test ${(n - 1) / 5} (≥ 38/50 overall and ≥ 12/20 on the practical) to unlock lessons ${n}–${n + 4}.`;
  return 'Locked.';
}
export function grandLockReason(p: Projection, k: number): string | null {
  if (p.grandAvailable[k]) return null;
  const missing = [0, 1, 2, 3, 4].map((d) => 5 * k - d).filter((n) => !p.complete[n]).reverse();
  return `Complete lessons ${missing.join(', ')} to take Grand Test ${k}.`;
}
export function nextAction(p: Projection): { kind: 'lesson' | 'grand' | 'done'; n: number } {
  for (let n = 1; n <= TOTAL_LESSONS; n++) {
    if (!p.unlocked[n]) { const k = (n - 1) / 5; if (Number.isInteger(k) && p.grandAvailable[k] && !p.grandPassed[k]) return { kind: 'grand', n: k }; break; }
    if (!p.complete[n]) return { kind: 'lesson', n };
  }
  if (p.grandAvailable[24] && !p.grandPassed[24]) return { kind: 'grand', n: 24 };
  return p.completedCount === TOTAL_LESSONS ? { kind: 'done', n: 120 } : { kind: 'lesson', n: p.current };
}

// ---------- boundary self-tests (run from Settings → Diagnostics) ----------
export function progressionSelfTests(): { name: string; passed: boolean }[] {
  const mk = (upTo: number, grandsUpTo: number, opts: { mcqScore?: number; failPracticalAt?: number; grandFailAt?: number; practicalScoreGrand?: number } = {}): Hist => {
    const mcq: any[] = [], practical: any[] = [], grand: any[] = [];
    for (let n = 1; n <= upTo; n++) {
      mcq.push({ lesson: n, score: n === upTo && opts.mcqScore !== undefined ? opts.mcqScore : 18, total: 20 });
      practical.push({ lesson: n, passed: n !== opts.failPracticalAt });
    }
    for (let k = 1; k <= grandsUpTo; k++) grand.push({ k, total: k === opts.grandFailAt ? 37 : 45, practical: opts.practicalScoreGrand ?? 16 });
    return { mcq, practical, grand } as Hist;
  };
  const t: [string, boolean][] = [];
  const P0 = project({ mcq: [], practical: [], grand: [] } as Hist);
  t.push(['Fresh install: only lesson 1 unlocked', P0.unlocked[1] && !P0.unlocked[2]]);
  t.push(['14/20 does not complete a lesson', !project(mk(1, 0, { mcqScore: 14 })).complete[1]]);
  t.push(['15/20 + practical completes lesson 1 and unlocks lesson 2', project(mk(1, 0, { mcqScore: 15 })).unlocked[2]]);
  t.push(['MCQ passed but practical failed keeps next lesson locked', !project(mk(3, 0, { failPracticalAt: 3 })).unlocked[4]]);
  const p5 = project(mk(5, 0));
  t.push(['Lesson 5 complete: Grand Test 1 available', p5.grandAvailable[1]]);
  t.push(['Lesson 5 complete but no grand test: lesson 6 locked', !p5.unlocked[6]]);
  t.push(['Grand Test 1 passed: lesson 6 unlocked', project(mk(5, 1)).unlocked[6]]);
  t.push(['Grand Test 1 at 37/50 fails: lesson 6 locked', !project(mk(5, 1, { grandFailAt: 1 })).unlocked[6]]);
  t.push(['Grand Test 45/50 but practical 11/20 fails: lesson 6 locked', !project(mk(5, 1, { practicalScoreGrand: 11 })).unlocked[6]]);
  t.push(['Lesson 10 boundary: Grand Test 2 gates lesson 11', !project(mk(10, 1)).unlocked[11] && project(mk(10, 2)).unlocked[11]]);
  t.push(['Lesson 30 boundary (beginner → intermediate)', !project(mk(30, 5)).unlocked[31] && project(mk(30, 6)).unlocked[31]]);
  t.push(['Lesson 70 boundary (intermediate → advanced)', !project(mk(70, 13)).unlocked[71] && project(mk(70, 14)).unlocked[71]]);
  t.push(['Lesson 115 boundary: Grand Test 23 gates lesson 116', !project(mk(115, 22)).unlocked[116] && project(mk(115, 23)).unlocked[116]]);
  const p120 = project(mk(120, 24));
  t.push(['Lesson 120: all complete + Grand Test 24 passed', p120.completedCount === 120 && p120.grandPassed[24]]);
  t.push(['Lesson 120 complete without Grand Test 24 → final grand pending', nextAction(project(mk(120, 23))).kind === 'grand']);
  const retake: Hist = { mcq: [{ lesson: 1, score: 18, total: 20 }, { lesson: 1, score: 3, total: 20 }] as any, practical: [{ lesson: 1, passed: true }] as any, grand: [] };
  t.push(['A later failed retake does not revoke an earlier pass', project(retake).complete[1]]);
  const skipped: Hist = { mcq: [{ lesson: 7, score: 20, total: 20 }] as any, practical: [{ lesson: 7, passed: true }] as any, grand: [] };
  t.push(['Results for a locked lesson do not count (consistency)', !project(skipped).complete[7]]);
  return t.map(([name, passed]) => ({ name, passed }));
}

/** Grand-test scoring: 20 MCQ marks + 2 × 5 coding marks + 20 practical marks (graded on 0–100 scales). */
export function scoreGrand(mcq: number, coding1Pct: number, coding2Pct: number, practicalPct: number) {
  const clampPct = (x: number) => Math.max(0, Math.min(100, x));
  const c1 = Math.round((clampPct(coding1Pct) / 100) * 5), c2 = Math.round((clampPct(coding2Pct) / 100) * 5);
  const pr = Math.round((clampPct(practicalPct) / 100) * 20);
  const m = Math.max(0, Math.min(20, Math.round(mcq)));
  const total = m + c1 + c2 + pr;
  return { mcq: m, c1, c2, pr, coding: c1 + c2, total, passed: total >= GRAND_PASS && pr >= GRAND_PRACTICAL_MIN };
}
/** Lesson exam rule: exactly 20 questions, pass at 15. */
export const examPassed = (score: number, total: number) => total === 20 && score >= EXAM_PASS;
