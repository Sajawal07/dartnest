// Assembles the fixed 120-lesson curriculum, question banks, grand tests, projects and practice.
import { LESSONS_A, RawLesson } from './lessons-a';
import { LESSONS_B } from './lessons-b';
import { LESSONS_C } from './lessons-c';
import { TASKS } from './tasks';
import type { TaskDef } from '../engine/harness';
import { runProgram } from '../engine/runtime';

export const TITLES = [
  'Flutter and Dart introduction', 'Flutter project structure', 'main() and runApp()', 'Variables, final, and const', 'Dart data types and collections',
  'Operators and null-aware operators', 'Conditions and switch', 'Loops and iteration', 'Functions, parameters, and return types', 'Arrow functions, anonymous functions, and callbacks',
  'Null safety and nullable types', 'List, Map, Set, and collection transformations', 'Classes, objects, and constructors', 'Named, factory, and parameterized constructors', 'Inheritance, interfaces, and polymorphism',
  'Flutter widgets and widget trees', 'StatelessWidget', 'StatefulWidget and setState', 'Widget lifecycle and dispose', 'MaterialApp and Scaffold',
  'Text, Icon, and Image', 'Container and decoration', 'Row and Column', 'Padding, Center, Align, and SizedBox', 'Expanded, Flexible, and Spacer',
  'Scroll views, ListView, and GridView', 'Card, ListTile, Divider, and Stack', 'Flutter button types and callbacks', 'TextField, controllers, and focus', 'Mini project: profile and settings screen',
  'BuildContext', 'Widget composition', 'Custom reusable widgets', 'Keys and widget identity', 'Conditional UI and application states',
  'Form and TextFormField', 'Form validation', 'Keyboard and focus management', 'Gestures and touch interactions', 'Advanced lists, filtering, and sorting',
  'Dropdowns and selection controls', 'Navigator push and pop', 'Route arguments and return values', 'Named routes and declarative navigation', 'Lifecycle cleanup and mounted checks',
  'Future, async, and await', 'Streams and StreamBuilder', 'Exceptions and error handling', 'JSON encoding and decoding', 'Typed models and serialization',
  'HTTP requests, headers, and status codes', 'API-driven loading, success, empty, and error states', 'Pagination, search, and debouncing', 'Network images and caching', 'Local persistence options',
  'SQLite CRUD and queries', 'Offline-first application design', 'Persistent settings', 'Ephemeral and application state', 'Provider and ChangeNotifier',
  'Riverpod fundamentals', 'Asynchronous state management', 'Dependency injection', 'Clean architecture fundamentals', 'Repository pattern',
  'Material 3 theming', 'Responsive and adaptive layouts', 'Accessibility fundamentals', 'Implicit and explicit animation fundamentals', 'Mini project: offline task manager',
  'Generics and advanced typing', 'Extensions, enums, and pattern matching', 'Mixins, sealed classes, and records', 'Functional programming patterns', 'SOLID principles',
  'Flutter rendering pipeline', 'Layout constraints and render debugging', 'Slivers and custom scrolling', 'Advanced gesture handling', 'CustomPainter and Canvas',
  'Animation controllers and tickers', 'Hero animations and route transitions', 'Reusable design systems and design tokens', 'Advanced and dynamic forms', 'Nested navigation and deep links',
  'Advanced state architecture', 'Provider, Riverpod, and BLoC trade-offs', 'State consistency and optimistic updates', 'Repository boundaries and replaceable data sources', 'Database schema, migrations, and indexes',
  'Transactions and data integrity', 'Secure local data handling', 'Advanced REST API architecture', 'Authentication and session lifecycle', 'Offline synchronization and conflict resolution',
  'Network retries and reliability', 'File and media handling', 'Background work and platform limitations', 'Local notifications and scheduling', 'Platform channels and native integration',
  'Unit testing', 'Widget testing', 'Integration testing', 'Mocks, fakes, and stubs', 'Test-driven development',
  'Debugging and stack traces', 'Flutter DevTools and profiling', 'Rendering and memory performance', 'Isolates and concurrency', 'Accessibility, localization, and RTL',
  'Security engineering and trust boundaries', 'Static analysis, linting, and refactoring', 'Build flavors and environment configuration', 'Android Gradle, manifests, and signing', 'Release engineering and app bundles',
  'CI/CD fundamentals', 'Reusable package development', 'Advanced architecture review', 'Capstone I: build a complete application', 'Capstone II: audit, test, optimize, and prepare a release',
];

export type Track = 'Beginner' | 'Intermediate' | 'Advanced';
export interface CodeExample { title: string; code: string; kind: 'dart' | 'flutter' | 'snippet'; note: string }
export interface Lesson {
  id: string; n: number; title: string; track: Track; difficulty: number; minutes: number;
  objectives: string[]; prereqs: number[]; intro: string; concept: string; terms: [string, string][];
  examples: CodeExample[]; why: string; when: string; whenNot: string; pros: string; cons: string;
  mistake: { bad: string; good: string; why: string }; uses: string; task: TaskDef;
  summary: string[]; revision: string[]; related: string[]; nextPrereq: string;
  facts: RawLesson['f']; block: number;
}

const RAW: Record<number, RawLesson> = { ...LESSONS_A, ...LESSONS_B, ...LESSONS_C };
export const trackOf = (n: number): Track => (n <= 30 ? 'Beginner' : n <= 70 ? 'Intermediate' : 'Advanced');
export const blockOf = (n: number) => Math.ceil(n / 5);

/** Sentence split that ignores periods inside `code` spans or parentheses and merges very short lead sentences. */
function sentences(s: string): string[] {
  const out: string[] = []; let cur = ''; let code = false; let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]; cur += ch;
    if (ch === '`') code = !code;
    else if (!code && ch === '(') depth++;
    else if (!code && ch === ')') depth = Math.max(0, depth - 1);
    else if (!code && depth === 0 && '.!?'.includes(ch) && (i === s.length - 1 || /\s/.test(s[i + 1]))) { out.push(cur.trim()); cur = ''; }
  }
  if (cur.trim()) out.push(cur.trim());
  while (out.length > 1 && out[0].length < 60) out.splice(0, 2, out[0] + ' ' + out[1]);
  return out.length ? out : [s];
}
function kindOf(code: string): CodeExample['kind'] {
  if (/package:flutter/.test(code) && /runApp\(/.test(code)) return 'flutter';
  if (/runApp\(/.test(code)) return 'snippet';
  if (/void main\(\)/.test(code) && !/^\s*#/m.test(code)) return 'dart';
  return 'snippet';
}

export const LESSONS: Lesson[] = TITLES.map((title, i) => {
  const n = i + 1; const r = RAW[n]; const task = TASKS[i];
  const track = trackOf(n);
  const s = sentences(r.b);
  const ex: CodeExample[] = [
    { title: 'Worked example', code: r.c, kind: kindOf(r.c), note: 'Read it top to bottom, then run it in the Code Lab.' },
    { title: 'Corrected pattern (from the common mistake)', code: r.m[1], kind: kindOf(r.m[1]), note: r.m[2] },
    { title: 'Complete reference implementation (practical)', code: task.solution, kind: task.kind === 'ui' ? 'flutter' : 'snippet', note: 'Study this after attempting the practical yourself — it is the solution the grader verifies.' },
  ];
  const prereqs = n === 1 ? [] : n % 5 === 1 ? [n - 1, n - 5].filter((x) => x > 0) : [n - 1];
  return {
    id: `L${String(n).padStart(3, '0')}`, n, title, track,
    difficulty: Math.min(5, 1 + Math.floor((n - 1) / 24)),
    minutes: track === 'Beginner' ? 25 : track === 'Intermediate' ? 35 : 45,
    objectives: [
      `Explain ${r.k[0][0]} and ${r.k[1][0]} in your own words.`,
      `Decide when to use — and when not to use — the techniques in "${title}".`,
      `Recognise and fix the common mistake: ${r.m[2].split(/[;.]/)[0].toLowerCase()}.`,
      `Complete the practical "${task.title}" with automated tests passing.`,
    ],
    prereqs, intro: s[0], concept: s.slice(1).join(' ') || s[0], terms: r.k, examples: ex,
    why: r.w, when: r.u, whenNot: r.n, pros: r.p, cons: r.x,
    mistake: { bad: r.m[0], good: r.m[1], why: r.m[2] }, uses: r.r, task,
    summary: [s[0], ...r.k.map(([t, d]) => `${t}: ${d}`), `Use it when: ${r.u}`],
    revision: [...r.f.map((f) => f[0]), `Why does this concept exist? (${r.w.split(' ').slice(0, 6).join(' ')}…)`, `Describe a real-world use of ${title.toLowerCase()}.`],
    related: [n > 1 ? `Builds on lesson ${n - 1}: ${TITLES[n - 2]}` : 'Starting point of the curriculum', n < 120 ? `Required for lesson ${n + 1}: ${TITLES[n]}` : 'Final lesson — prepare your release!'],
    nextPrereq: n < 120 ? TITLES[n] : '', facts: r.f, block: blockOf(n),
  };
});
export const lesson = (n: number) => LESSONS[n - 1];

// ---------------- line notes (line-by-line explanation) ----------------
const NOTE_RULES: [RegExp, string][] = [
  [/^import /, 'Imports a library so its declarations can be used in this file.'],
  [/void main\(\)/, 'Program entry point — execution starts here.'],
  [/runApp\(/, 'Makes the given widget the root of the widget tree.'],
  [/extends StatelessWidget/, 'Declares a widget whose UI depends only on its configuration.'],
  [/extends StatefulWidget/, 'Declares immutable configuration that creates a separate State object.'],
  [/extends State</, 'The State class: holds mutable fields and build() for the StatefulWidget.'],
  [/createState\(\)/, 'Creates the State object the framework keeps across rebuilds.'],
  [/setState\(/, 'Updates state and schedules a rebuild so the UI reflects the change.'],
  [/void initState\(\)/, 'One-time setup when the State is inserted into the tree.'],
  [/void dispose\(\)/, 'Cleanup: release controllers and listeners when removed.'],
  [/Widget build\(/, 'Describes the UI for the current state; must be fast and side-effect free.'],
  [/@override/, 'Marks an intentional override of a superclass member.'],
  [/^(abstract |sealed )?class /, 'Declares a class — a blueprint for objects.'],
  [/^enum /, 'Declares a fixed set of named values.'],
  [/^mixin /, 'Declares reusable members that can be mixed into classes.'],
  [/factory /, 'A factory constructor decides which instance to return.'],
  [/\basync\b/, 'Marks an asynchronous function that returns a Future.'],
  [/\bawait\b/, 'Pauses this function until the Future completes (without blocking the UI).'],
  [/^\s*try\b/, 'Starts a block whose exceptions can be caught.'],
  [/\bon \w+|catch \(/, 'Handles a thrown exception.'],
  [/switch \(/, 'Branches on a value; Dart 3 cases do not fall through.'],
  [/^\s*for \(/, 'Loop: repeats the body for each iteration.'],
  [/^\s*(if|} else if) \(/, 'Conditional: the condition must be a bool.'],
  [/\?\?/, "If-null operator: uses the right side when the left is null."],
  [/\?\./, 'Null-aware access: yields null instead of throwing.'],
  [/^\s*const /, 'Compile-time constant — deeply immutable.'],
  [/^\s*final /, 'Single-assignment variable.'],
  [/^\s*var /, 'Reassignable variable with an inferred type.'],
  [/=>/, 'Arrow syntax: returns the single expression.'],
  [/print\(/, 'Writes a line to the console output.'],
  [/^\s*return /, 'Returns a value to the caller.'],
];
export function lineNotes(code: string): { line: number; text: string; note: string }[] {
  const out: { line: number; text: string; note: string }[] = [];
  code.split('\n').forEach((text, i) => {
    const t = text.trim();
    if (!t || t.startsWith('//')) return;
    const rule = NOTE_RULES.find(([re]) => re.test(t));
    if (rule && !out.some((o) => o.note === rule[1])) out.push({ line: i + 1, text: t, note: rule[1] });
  });
  return out.slice(0, 10);
}

// ---------------- deterministic RNG ----------------
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle<T>(arr: T[], r: () => number): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickOthers<T>(n: number, getter: (l: Lesson) => T[], count: number, exclude: T[], seed: number): T[] {
  const r = rng(seed);
  const near = LESSONS.filter((l) => l.n !== n && Math.abs(l.n - n) <= 15);
  const pool = shuffle(near.flatMap(getter), r).filter((x, i, a) => !exclude.includes(x) && a.indexOf(x) === i);
  return pool.slice(0, count);
}

// ---------------- question bank ----------------
export type QType = 'concept' | 'syntax' | 'output' | 'bug' | 'decision' | 'interpretation' | 'review';
export interface BankQuestion { id: string; lesson: number; type: QType; prompt: string; code?: string; correct: string; distractors: string[]; explanation: string; section: string; optionsAreCode?: boolean }

const outputCache = new Map<number, string | null>();
export function exampleOutput(n: number): string | null {
  if (outputCache.has(n)) return outputCache.get(n)!;
  const l = lesson(n);
  let out: string | null = null;
  if (l.examples[0].kind === 'dart') {
    const r = runProgram(l.examples[0].code, { maxSteps: 200_000, maxMs: 500 });
    if (r.ok && r.output.length) out = r.output.join('\n');
  }
  outputCache.set(n, out);
  return out;
}
function outputDistractors(out: string, seed: number): string[] {
  const r = rng(seed); const set = new Set<string>();
  const lines = out.split('\n');
  const numMut = (delta: number) => { let done = false; return out.replace(/-?\d+(\.\d+)?/g, (m) => { if (done) return m; done = r() < 0.6; if (!done) return m; const isD = m.includes('.'); const v = Number(m) + delta; return isD ? v.toFixed(m.split('.')[1].length) : String(v); }); };
  set.add(numMut(1)); set.add(numMut(-1));
  if (/true|false/.test(out)) set.add(out.replace(/true|false/, (m) => (m === 'true' ? 'false' : 'true')));
  if (lines.length > 1) { const sw = [...lines]; [sw[0], sw[1]] = [sw[1], sw[0]]; set.add(sw.join('\n')); set.add(lines.slice(0, -1).join('\n')); }
  set.add(out.replace(/\.0\b/g, ''));
  set.add('Compile-time error');
  set.add(out.replace(/\[/g, '(').replace(/\]/g, ')'));
  set.delete(out);
  return shuffle([...set].filter((x) => x.trim()), r).slice(0, 3);
}

const bankCache = new Map<number, BankQuestion[]>();
export function lessonBank(n: number): BankQuestion[] {
  if (bankCache.has(n)) return bankCache.get(n)!;
  const l = lesson(n); const q: BankQuestion[] = [];
  const id = (s: string) => `${l.id}-${s}`;
  l.facts.forEach((f, i) => q.push({ id: id('f' + i), lesson: n, type: i === 0 ? 'concept' : 'decision', prompt: f[0], correct: f[1], distractors: f.slice(2), explanation: `Correct: "${f[1]}". ${l.intro}`, section: 'Concept' }));
  const allTerms = l.terms.map((t) => t[1]); const allNames = l.terms.map((t) => t[0]);
  l.terms.forEach(([t, d], i) => {
    q.push({ id: id('t' + i), lesson: n, type: 'syntax', prompt: `In the context of "${l.title}", what does "${t}" mean?`, correct: d, distractors: [...allTerms.filter((x) => x !== d), ...pickOthers(n, (o) => o.terms.map((x) => x[1]), 3, allTerms, n * 31 + i)].slice(0, 3), explanation: `${t}: ${d}`, section: 'Syntax & terminology' });
    q.push({ id: id('r' + i), lesson: n, type: 'syntax', prompt: `Which term matches this definition: "${d}"`, correct: t, distractors: [...allNames.filter((x) => x !== t), ...pickOthers(n, (o) => o.terms.map((x) => x[0]), 3, allNames, n * 37 + i)].slice(0, 3), explanation: `"${d}" describes ${t}.`, section: 'Syntax & terminology' });
  });
  q.push({ id: id('bug'), lesson: n, type: 'bug', prompt: 'What is the problem with this code?', code: l.mistake.bad, correct: l.mistake.why, distractors: pickOthers(n, (o) => [o.mistake.why], 3, [l.mistake.why], n * 41), explanation: l.mistake.why, section: 'Common mistakes' });
  q.push({ id: id('fix'), lesson: n, type: 'interpretation', prompt: 'Which snippet correctly fixes the problem described below?\n' + l.mistake.why, correct: l.mistake.good, distractors: [l.mistake.bad, ...pickOthers(n, (o) => [o.mistake.good], 2, [l.mistake.good], n * 43)], explanation: `The corrected version: ${l.mistake.why}`, section: 'Corrected examples', optionsAreCode: true });
  q.push({ id: id('why'), lesson: n, type: 'concept', prompt: `What problem does "${l.title}" primarily address?`, correct: l.why, distractors: pickOthers(n, (o) => [o.why], 3, [l.why], n * 47), explanation: l.why, section: 'Why it exists' });
  q.push({ id: id('when'), lesson: n, type: 'decision', prompt: `When is "${l.title}" the appropriate choice?`, correct: l.when, distractors: pickOthers(n, (o) => [o.when], 3, [l.when], n * 53), explanation: l.when, section: 'When to use' });
  q.push({ id: id('not'), lesson: n, type: 'decision', prompt: `Which is sound advice about when NOT to use the techniques from "${l.title}"?`, correct: l.whenNot, distractors: pickOthers(n, (o) => [o.whenNot], 3, [l.whenNot], n * 59), explanation: l.whenNot, section: 'When not to use' });
  q.push({ id: id('use'), lesson: n, type: 'concept', prompt: `Which is a realistic real-world use of "${l.title}"?`, correct: l.uses, distractors: pickOthers(n, (o) => [o.uses], 3, [l.uses], n * 61), explanation: l.uses, section: 'Real-world use cases' });
  q.push({ id: id('pro'), lesson: n, type: 'concept', prompt: `Which is an advantage of the approach taught in "${l.title}"?`, correct: l.pros, distractors: pickOthers(n, (o) => [o.pros], 3, [l.pros], n * 67), explanation: l.pros, section: 'Advantages & disadvantages' });
  q.push({ id: id('con'), lesson: n, type: 'decision', prompt: `Which is a genuine trade-off of the approach in "${l.title}"?`, correct: l.cons, distractors: pickOthers(n, (o) => [o.cons], 3, [l.cons], n * 71), explanation: l.cons, section: 'Advantages & disadvantages' });
  const out = exampleOutput(n);
  if (out) {
    const ds = outputDistractors(out, n * 73);
    if (ds.length === 3) q.push({ id: id('out'), lesson: n, type: 'output', prompt: 'What does this program print? (Verified by running it in the offline engine.)', code: l.examples[0].code, correct: out, distractors: ds, explanation: `The engine executed the program and it printed:\n${out}`, section: 'Code examples', optionsAreCode: true });
  }
  bankCache.set(n, q);
  return q;
}

const GENERAL: [string, string, string, string, string][] = [
  ['Which command creates a new Flutter project?', 'flutter create my_app', 'flutter new my_app', 'dart init flutter', 'npm create flutter'],
  ['Which file lists a Flutter app\'s dependencies?', 'pubspec.yaml', 'package.json', 'build.gradle only', 'main.dart'],
  ['What does `print(10 ~/ 3);` output?', '3', '3.3333333333333335', '4', '1'],
  ['Which keyword declares a variable that can be assigned only once?', 'final', 'var', 'dynamic', 'late var'],
  ['What is the type of `3.0` in Dart?', 'double', 'int', 'num only', 'float'],
  ['What does `\'Hi \' * 2` produce?', 'Hi Hi ', 'An error', 'Hi 2', '"Hi Hi"'],
];

function examBankFor(n: number): BankQuestion[] {
  const own = lessonBank(n);
  const reviewNeeded = 20 - own.length;
  const review: BankQuestion[] = [];
  const r = rng(n * 97);
  const prev = shuffle(LESSONS.filter((l) => l.n < n).slice(-10), r);
  for (const pl of prev) {
    if (review.length >= reviewNeeded) break;
    const f = pl.facts[Math.floor(r() * pl.facts.length)];
    review.push({ id: `${lesson(n).id}-rv${pl.n}`, lesson: pl.n, type: 'review', prompt: `Review (lesson ${pl.n}): ${f[0]}`, correct: f[1], distractors: f.slice(2), explanation: `From lesson ${pl.n} (${pl.title}): ${f[1]}.`, section: `Lesson ${pl.n} review` });
  }
  let gi = 0;
  while (review.length < reviewNeeded) { const f = GENERAL[gi % GENERAL.length]; review.push({ id: `${lesson(n).id}-g${gi}`, lesson: n, type: 'review', prompt: `Warm-up: ${f[0]}`, correct: f[1], distractors: f.slice(2), explanation: f[1], section: 'Fundamentals' }); gi++; }
  return [...own, ...review].slice(0, 20);
}

// ---------------- exam sessions (answer key kept out of the public question objects) ----------------
export interface PublicQuestion { qid: string; index: number; type: QType; prompt: string; code?: string; options: string[]; optionsAreCode?: boolean }
interface KeyEntry { correctIndex: number; bank: BankQuestion }
const ANSWER_KEYS = new Map<string, Map<string, KeyEntry>>();

export function createExam(questions: BankQuestion[], seed: number, sessionId: string): PublicQuestion[] {
  const r = rng(seed);
  const order = shuffle(questions, r);
  const key = new Map<string, KeyEntry>();
  const pub = order.map((b, i) => {
    const opts = shuffle([b.correct, ...b.distractors.slice(0, 3)], r);
    const qid = `${sessionId}:${i}`;
    key.set(qid, { correctIndex: opts.indexOf(b.correct), bank: b });
    return { qid, index: i, type: b.type, prompt: b.prompt, code: b.code, options: opts, optionsAreCode: b.optionsAreCode };
  });
  ANSWER_KEYS.set(sessionId, key);
  return pub;
}
export function lessonExam(n: number, seed: number) { const sid = `exam-${n}-${seed}`; return { sessionId: sid, questions: createExam(examBankFor(n), seed, sid) }; }

export interface ReviewItem { qid: string; correct: boolean; chosen: number | null; correctIndex: number; explanation: string; section: string; lesson: number; type: QType }
export function gradeExam(sessionId: string, answers: Record<string, number>): { score: number; total: number; review: ReviewItem[] } {
  const key = ANSWER_KEYS.get(sessionId);
  if (!key) throw new Error('Unknown exam session');
  const review: ReviewItem[] = [];
  let score = 0;
  for (const [qid, k] of key) {
    const chosen = answers[qid] ?? null;
    const ok = chosen === k.correctIndex;
    if (ok) score++;
    review.push({ qid, correct: ok, chosen, correctIndex: k.correctIndex, explanation: k.bank.explanation, section: k.bank.section, lesson: k.bank.lesson, type: k.bank.type });
  }
  return { score, total: key.size, review };
}

// ---------------- grand tests ----------------
export const GRAND_COUNT = 24;
export interface GrandSpec { k: number; lessons: number[]; coding: TaskDef[]; practical: TaskDef }
export function grandSpec(k: number): GrandSpec {
  const lessons = [5 * k - 4, 5 * k - 3, 5 * k - 2, 5 * k - 1, 5 * k];
  const tasks = lessons.map((n) => TASKS[n - 1]);
  const practical = [...tasks].reverse().find((t) => t.kind === 'ui') ?? tasks[4];
  const coding = tasks.filter((t) => t !== practical && t.kind === 'logic').slice(0, 2);
  while (coding.length < 2) coding.push(tasks.find((t) => t !== practical && !coding.includes(t))!);
  return { k, lessons, coding, practical };
}
export function grandExam(k: number, seed: number) {
  const r = rng(seed * 7 + k);
  const spec = grandSpec(k);
  const qs: BankQuestion[] = [];
  const perLesson = k > 1 ? 3 : 4;
  for (const n of spec.lessons) qs.push(...shuffle(lessonBank(n), r).slice(0, perLesson));
  if (k > 1) {
    const earlier = LESSONS.filter((l) => l.n < spec.lessons[0]);
    for (const l of shuffle(earlier, r).slice(0, 20 - qs.length)) { const f = l.facts[0]; qs.push({ id: `G${k}-e${l.n}`, lesson: l.n, type: 'review', prompt: `Cumulative (lesson ${l.n}): ${f[0]}`, correct: f[1], distractors: f.slice(2), explanation: f[1], section: `Lesson ${l.n}` }); }
  }
  const sid = `grand-${k}-${seed}`;
  return { sessionId: sid, questions: createExam(qs.slice(0, 20), seed, sid), spec };
}
export const GRAND_PASS = 38; export const GRAND_PRACTICAL_MIN = 12;
export const EXAM_PASS = 15;

// ---------------- projects ----------------
export { PROJECTS, type Project } from './projects';

// ---------------- practice ----------------
export type PracticeKind = 'mcq' | 'output' | 'debug' | 'completion';
export interface PracticeItem { id: string; kind: PracticeKind; lesson: number; prompt: string; code?: string; options: string[]; answer: number; explanation: string; optionsAreCode?: boolean }
export function practiceSet(lessons: number[], kinds: PracticeKind[], seed: number, count = 6): PracticeItem[] {
  const r = rng(seed);
  const items: PracticeItem[] = [];
  const mk = (b: BankQuestion, kind: PracticeKind): PracticeItem => { const opts = shuffle([b.correct, ...b.distractors.slice(0, 3)], r); return { id: b.id + ':' + kind, kind, lesson: b.lesson, prompt: b.prompt, code: b.code, options: opts, answer: opts.indexOf(b.correct), explanation: b.explanation, optionsAreCode: b.optionsAreCode }; };
  for (const n of lessons) {
    const bank = lessonBank(n);
    if (kinds.includes('mcq')) bank.filter((b) => ['concept', 'syntax', 'decision'].includes(b.type)).forEach((b) => items.push(mk(b, 'mcq')));
    if (kinds.includes('output')) bank.filter((b) => b.type === 'output').forEach((b) => items.push(mk(b, 'output')));
    if (kinds.includes('debug')) bank.filter((b) => b.type === 'bug' || b.type === 'interpretation').forEach((b) => items.push(mk(b, 'debug')));
    if (kinds.includes('completion')) {
      const t = TASKS[n - 1];
      const lines = t.solution.split('\n').map((x) => x.trim()).filter((x) => x.length > 12 && !x.startsWith('import') && !x.startsWith('//') && !/^[})\]]/.test(x) && !x.startsWith('@'));
      if (lines.length) {
        const target = lines[Math.floor(r() * lines.length)];
        const others = shuffle(TASKS.filter((o) => o !== t).flatMap((o) => o.solution.split('\n').map((x) => x.trim()).filter((x) => x.length > 12 && !x.startsWith('import'))), r).slice(0, 3);
        const opts = shuffle([target, ...others], r);
        const code = t.solution.split('\n').map((x) => (x.trim() === target ? x.replace(target, '/* ▢ missing line ▢ */') : x)).join('\n');
        items.push({ id: `${t.id}:completion`, kind: 'completion', lesson: n, prompt: `Code completion — "${t.title}": which line fills the gap?`, code, options: opts, answer: opts.indexOf(target), explanation: `The missing line is: ${target}`, optionsAreCode: true });
      }
    }
  }
  return shuffle(items, r).slice(0, count);
}
