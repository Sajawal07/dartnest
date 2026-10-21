// Immutable educational content, normalised into indexed "tables" built from bundled modules.
// No content is fabricated at runtime: everything derives from the authored lesson/task assets.
import { LESSONS, TITLES, lessonExam, gradeExam, grandExam, grandSpec, type Lesson } from './curriculum';
import { TASKS } from './tasks';
import { PROJECTS } from './projects';
import { parseProgram } from '../engine/parser';
import { runProgram } from '../engine/runtime';
import { installFlutter } from '../engine/flutter';
import { CONTENT_VERSION } from '../domain/store';

export type ExampleCategory = 'interpreter' | 'analysis' | 'fragment' | 'pseudo';
export const CATEGORY_INFO: Record<ExampleCategory, { label: string; tone: 'good' | 'info' | 'neutral' | 'warn'; help: string }> = {
  interpreter: { label: 'Supported interpreter code', tone: 'good', help: 'Valid Dart/Flutter that also runs in the offline interpreter and preview.' },
  analysis: { label: 'Real Dart/Flutter · static-analysis only', tone: 'info', help: 'A complete program that the offline engine can parse but cannot fully execute (e.g. uses unsupported APIs).' },
  fragment: { label: 'Real Dart/Flutter fragment', tone: 'neutral', help: 'Real code shown out of context (not a standalone program); read it, then try it inside a full program.' },
  pseudo: { label: 'Conceptual pseudocode / config', tone: 'warn', help: 'Illustrative code with placeholders (…), comments-only steps, YAML or Kotlin — not runnable Dart.' },
};

const catCache = new Map<string, ExampleCategory>();
export function exampleCategory(code: string): ExampleCategory {
  const hit = catCache.get(code); if (hit) return hit;
  let c: ExampleCategory;
  if (/\.\.\.\s*[\n}]|\{\s*\.\.\.\s*\}|^\s*#|\/\/\s*(Kotlin|pubspec|sqflite \(conceptual|Riverpod \(conceptual|testWidgets)|else ->/m.test(code) || /…/.test(code)) c = 'pseudo';
  else {
    try {
      parseProgram(code);
      const r = runProgram(code, { maxSteps: 300_000, maxMs: 800 }, installFlutter);
      c = r.ok ? 'interpreter' : /main\(\)/.test(code) ? 'analysis' : 'fragment';
    } catch { c = /void main\(\)/.test(code) ? 'analysis' : 'fragment'; }
  }
  catCache.set(code, c);
  return c;
}

// ---------- tables ----------
export interface LessonRow { id: string; n: number; title: string; track: string; difficulty: number; minutes: number; contentVersion: string }
export interface SectionRow { lessonId: string; kind: string; text: string }
export interface ExampleRow { id: string; lessonId: string; idx: number; category: ExampleCategory; code: string }
export interface ChallengeRow { id: string; lessonId: string; kind: string; testCount: number; rubric: string[] }

let tables: { lessons: Map<string, LessonRow>; byNumber: Map<number, LessonRow>; sections: SectionRow[]; examples: ExampleRow[]; challenges: Map<string, ChallengeRow>; index: Map<string, Set<number>> } | null = null;
const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9_ ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1);

export function db() {
  if (tables) return tables;
  const lessons = new Map<string, LessonRow>(); const byNumber = new Map<number, LessonRow>();
  const sections: SectionRow[] = []; const examples: ExampleRow[] = []; const challenges = new Map<string, ChallengeRow>();
  const index = new Map<string, Set<number>>();
  const addIdx = (text: string, n: number, weight = 1) => { for (const w of tokenize(text)) { if (!index.has(w)) index.set(w, new Set()); index.get(w)!.add(n); } void weight; };
  for (const l of LESSONS) {
    const row: LessonRow = { id: l.id, n: l.n, title: l.title, track: l.track, difficulty: l.difficulty, minutes: l.minutes, contentVersion: CONTENT_VERSION };
    lessons.set(l.id, row); byNumber.set(l.n, row);
    const sec: [string, string][] = [['intro', l.intro], ['concept', l.concept], ['why', l.why], ['when', l.when], ['whenNot', l.whenNot], ['pros', l.pros], ['cons', l.cons], ['uses', l.uses], ['mistake', l.mistake.why]];
    for (const [kind, text] of sec) sections.push({ lessonId: l.id, kind, text });
    l.examples.forEach((ex, idx) => examples.push({ id: `${l.id}-ex${idx}`, lessonId: l.id, idx, category: 'fragment', code: ex.code }));
    challenges.set(l.task.id, { id: l.task.id, lessonId: l.id, kind: l.task.kind, testCount: l.task.tests.length, rubric: ['10 parse', '10 structure', `80 across ${l.task.tests.length} tests`] });
    addIdx(`${l.title} ${l.terms.map((t) => t[0] + ' ' + t[1]).join(' ')} ${l.intro} ${l.concept} ${l.task.title}`, l.n);
  }
  tables = { lessons, byNumber, sections, examples, challenges, index };
  return tables;
}

/** Ranked search over title, terminology, concepts and practical titles. */
export function searchLessons(q: string): number[] {
  const words = tokenize(q);
  if (!words.length) return LESSONS.map((l) => l.n);
  const { index } = db();
  const score = new Map<number, number>();
  for (const w of words) {
    for (const [term, set] of index) {
      if (!term.startsWith(w)) continue;
      for (const n of set) score.set(n, (score.get(n) ?? 0) + (term === w ? 3 : 1));
    }
  }
  const titleHit = (n: number) => (LESSONS[n - 1].title.toLowerCase().includes(q.toLowerCase().trim()) ? 10 : 0);
  const num = Number(q.trim());
  if (Number.isInteger(num) && num >= 1 && num <= 120) score.set(num, (score.get(num) ?? 0) + 100);
  return [...score.entries()].filter(([n]) => words.every((w) => [...index.entries()].some(([t, s]) => t.startsWith(w) && s.has(n))) || n === num)
    .sort((a, b) => b[1] + titleHit(b[0]) - (a[1] + titleHit(a[0])) || a[0] - b[0]).map(([n]) => n);
}

// ---------- integrity verification ----------
export interface Check { name: string; passed: boolean; detail?: string }
const REQUIRED: (keyof Lesson)[] = ['objectives', 'intro', 'concept', 'terms', 'examples', 'why', 'when', 'whenNot', 'pros', 'cons', 'mistake', 'uses', 'task', 'summary', 'revision', 'related'];
export function verifyContent(opts: { deep?: boolean } = {}): Check[] {
  const out: Check[] = [];
  const ids = LESSONS.map((l) => l.id);
  out.push({ name: 'Exactly 120 lessons', passed: LESSONS.length === 120 });
  out.push({ name: 'Lesson IDs L001–L120 are unique and ordered', passed: ids.every((id, i) => id === `L${String(i + 1).padStart(3, '0')}`) && new Set(ids).size === 120 });
  out.push({ name: 'Titles match the fixed curriculum', passed: LESSONS.every((l, i) => l.title === TITLES[i]) });
  const missing = LESSONS.flatMap((l) => REQUIRED.filter((k) => { const v: any = l[k]; return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0); }).map((k) => `${l.id}.${String(k)}`));
  out.push({ name: 'Every lesson has all required content fields', passed: missing.length === 0, detail: missing.slice(0, 5).join(', ') });
  out.push({ name: 'Every lesson has ≥ 3 code examples', passed: LESSONS.every((l) => l.examples.length >= 3) });
  out.push({ name: 'Every lesson has a practical task with tests, hints and solution', passed: TASKS.length === 120 && TASKS.every((t) => t && t.tests.length > 0 && t.hints.length > 0 && t.solution.length > 0) });
  let examOk = true, keyOk = true; const bad: string[] = [];
  for (const l of LESSONS) {
    const e = lessonExam(l.n, 7);
    if (e.questions.length !== 20 || e.questions.some((q) => q.options.length !== 4 || new Set(q.options).size !== 4)) { examOk = false; bad.push(l.id); }
    if (opts.deep !== false) {
      const blank = gradeExam(e.sessionId, {});
      const key = Object.fromEntries(blank.review.map((r) => [r.qid, r.correctIndex]));
      const full = gradeExam(e.sessionId, key);
      if (blank.score !== 0 || full.score !== 20 || blank.review.some((r) => r.correctIndex < 0 || r.correctIndex > 3)) { keyOk = false; bad.push(l.id + ':key'); }
      if ('correct' in (e.questions[0] as any) || 'correctIndex' in (e.questions[0] as any)) { keyOk = false; bad.push(l.id + ':leak'); }
    }
  }
  out.push({ name: 'Every lesson exam has exactly 20 MCQs × 4 distinct options', passed: examOk, detail: bad.slice(0, 5).join(', ') });
  out.push({ name: 'Answer keys are complete, valid and kept out of public question data', passed: keyOk });
  let gOk = true;
  for (let k = 1; k <= 24; k++) { const g = grandExam(k, 3); const s = grandSpec(k); if (g.questions.length !== 20 || s.coding.length !== 2 || !s.practical) gOk = false; }
  out.push({ name: '24 grand tests: 20 MCQ + 2 coding + 1 practical each', passed: gOk });
  out.push({ name: '15 projects including a capstone', passed: PROJECTS.length === 15 && PROJECTS.some((p) => p.capstone) });
  return out;
}
