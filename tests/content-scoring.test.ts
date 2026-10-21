import { describe, it, expect } from 'vitest';
import { LESSONS, TITLES, lessonExam, gradeExam, grandExam, grandSpec, lessonBank, exampleOutput } from '../src/data/curriculum';
import { verifyContent, searchLessons, exampleCategory, db } from '../src/data/contentDb';
import { TASKS } from '../src/data/tasks';
import { grade } from '../src/engine/harness';
import { scoreGrand, examPassed } from '../src/domain/progression';
import { runProgram } from '../src/engine/runtime';

describe('Content completeness', () => {
  it('verifyContent: every integrity check passes', () => {
    const checks = verifyContent();
    expect(checks.filter((c) => !c.passed)).toEqual([]);
    expect(checks.length).toBeGreaterThanOrEqual(10);
  });
  it('has all 120 lesson IDs in order with the fixed titles', () => {
    expect(LESSONS.map((l) => l.id)).toEqual(Array.from({ length: 120 }, (_, i) => `L${String(i + 1).padStart(3, '0')}`));
    expect(LESSONS.map((l) => l.title)).toEqual(TITLES);
    expect(LESSONS.filter((l) => l.track === 'Beginner')).toHaveLength(30);
    expect(LESSONS.filter((l) => l.track === 'Intermediate')).toHaveLength(40);
    expect(LESSONS.filter((l) => l.track === 'Advanced')).toHaveLength(50);
  });
  it('every lesson has authored (non-generic) content in each section', () => {
    for (const l of LESSONS) {
      for (const f of [l.intro, l.concept, l.why, l.mistake.why]) expect(f.length, l.id).toBeGreaterThanOrEqual(30);
      expect(l.uses.length, l.id).toBeGreaterThan(20);
      for (const f of [l.when, l.whenNot, l.pros, l.cons]) expect(f.length, l.id).toBeGreaterThan(10);
      expect(l.intro, l.id).not.toMatch(/^([)}\]]|\w*`\.)/); // sentence split never starts inside code
      expect(l.terms.length).toBeGreaterThanOrEqual(2);
      expect(l.examples.length).toBeGreaterThanOrEqual(3);
      expect(l.facts.length).toBeGreaterThanOrEqual(1);
      expect(l.task.tests.length).toBeGreaterThan(0);
    }
    const intros = new Set(LESSONS.map((l) => l.intro));
    expect(intros.size).toBe(120); // no duplicated/placeholder text
  });
  it('database tables index all lessons, examples and challenges', () => {
    const t = db();
    expect(t.lessons.size).toBe(120);
    expect(t.examples.length).toBeGreaterThanOrEqual(360);
    expect(t.challenges.size).toBe(120);
  });
  it('search finds lessons by title, concept and keyword', () => {
    expect(searchLessons('setState')[0]).toBe(18);
    expect(searchLessons('keys')).toContain(34);
    expect(searchLessons('migrations')).toContain(90);
    expect(searchLessons('42')[0]).toBe(42);
    expect(searchLessons('zzqqxx')).toEqual([]);
  });
  it('worked examples that print are verified by execution; Flutter examples are labelled', () => {
    let verified = 0;
    for (const l of LESSONS) { const o = exampleOutput(l.n); if (o) { verified++; expect(runProgram(l.examples[0].code).output.join('\n')).toBe(o); } }
    expect(verified).toBeGreaterThan(80);
    expect(exampleCategory(LESSONS[17].examples[0].code)).toBe('interpreter');
    expect(exampleCategory("# pubspec.yaml\nflutter:\n  assets:")).toBe('pseudo');
  });
});

describe('MCQ exams & answer keys', () => {
  it('every lesson exam has exactly 20 questions with 4 distinct options and no leaked keys', () => {
    for (const l of LESSONS) {
      const e = lessonExam(l.n, 11);
      expect(e.questions).toHaveLength(20);
      for (const q of e.questions) { expect(new Set(q.options).size).toBe(4); expect(Object.keys(q)).not.toContain('correct'); expect(Object.keys(q)).not.toContain('correctIndex'); }
    }
  });
  it('answer keys grade an all-correct sheet 20/20 and an empty sheet 0/20', () => {
    for (const n of [1, 30, 70, 120]) {
      const e = lessonExam(n, 5);
      const blank = gradeExam(e.sessionId, {});
      expect(blank.score).toBe(0);
      const key = Object.fromEntries(blank.review.map((r) => [r.qid, r.correctIndex]));
      expect(gradeExam(e.sessionId, key).score).toBe(20);
    }
  });
  it('regression: exactly 14/20 fails and exactly 15/20 passes', () => {
    const e = lessonExam(3, 9);
    const key = Object.fromEntries(gradeExam(e.sessionId, {}).review.map((r) => [r.qid, r.correctIndex]));
    const qids = Object.keys(key);
    const sheet = (correct: number) => Object.fromEntries(qids.map((q, i) => [q, i < correct ? key[q] : (key[q] + 1) % 4]));
    const r14 = gradeExam(e.sessionId, sheet(14)), r15 = gradeExam(e.sessionId, sheet(15));
    expect(r14.score).toBe(14); expect(examPassed(r14.score, r14.total)).toBe(false);
    expect(r15.score).toBe(15); expect(examPassed(r15.score, r15.total)).toBe(true);
    expect(r14.review.filter((r) => !r.correct).every((r) => r.explanation.length > 0)).toBe(true);
  });
  it('retakes get a new question order', () => {
    const a = lessonExam(10, 1).questions.map((q) => q.prompt).join('|');
    const b = lessonExam(10, 2).questions.map((q) => q.prompt).join('|');
    expect(a).not.toBe(b);
  });
  it('question banks mix question types', () => {
    const types = new Set(lessonBank(12).map((q) => q.type));
    for (const t of ['concept', 'syntax', 'bug', 'decision', 'interpretation']) expect(types.has(t as any)).toBe(true);
  });
});

describe('Practical scoring', () => {
  it('all 120 lesson reference solutions score 100 and starters do not pass', () => {
    for (const t of TASKS) { expect(grade(t, t.solution).score, t.id).toBe(100); expect(grade(t, t.starter).passed, t.id).toBe(false); }
  });
  it('awards partial credit per test and needs 70 to pass', () => {
    const t = TASKS[6]; // grade(score) — 5 tests
    const partial = grade(t, "String grade(int score) {\n  if (score >= 90) return 'A';\n  return 'F';\n}\n");
    expect(partial.score).toBeGreaterThan(20); expect(partial.score).toBeLessThan(100);
    expect(partial.breakdown.some((b) => b.passed) && partial.breakdown.some((b) => !b.passed)).toBe(true);
  });
  it('does not pass on keywords alone: correct-looking but wrong code fails', () => {
    expect(grade(TASKS[7], 'int factorial(int n) {\n  var result = 1;\n  for (var i = 2; i < n; i++) {\n    result *= i;\n  }\n  return result;\n}\n').passed).toBe(false);
  });
  it('reports unsupported constructs honestly instead of marking them wrong', () => {
    const r = grade(TASKS[1], "extension on String { String get shout => toUpperCase(); }\nString greet(String name) => 'Hello, $name!';\n");
    expect(r.status).toBe('unsupported');
    expect(r.message).toMatch(/limitation of the engine/);
  });
  it('UI tasks are graded behaviourally (taps change state)', () => {
    const t = TASKS[17];
    const noState = t.solution.replace('setState(() => count++)', 'count++');
    const r = grade(t, noState);
    expect(r.passed).toBe(false);
    expect(r.breakdown.find((b) => b.name === 'One tap')!.passed).toBe(false);
  });
});

describe('Grand tests', () => {
  it('24 grand tests with 20 MCQs, 2 coding tasks and 1 practical covering the block', () => {
    for (let k = 1; k <= 24; k++) {
      const g = grandExam(k, 4);
      expect(g.questions).toHaveLength(20);
      const s = grandSpec(k);
      expect(s.lessons).toEqual([5 * k - 4, 5 * k - 3, 5 * k - 2, 5 * k - 1, 5 * k]);
      expect(s.coding).toHaveLength(2);
      expect(s.practical).toBeTruthy();
    }
  });
  it('regression: 37/50 fails and 38/50 passes', () => {
    const fail = scoreGrand(17, 100, 100, 50); // 17 + 5 + 5 + 10 = 37
    expect(fail.total).toBe(37); expect(fail.passed).toBe(false);
    const pass = scoreGrand(16, 100, 100, 60); // 16 + 5 + 5 + 12 = 38
    expect(pass.total).toBe(38); expect(pass.passed).toBe(true);
  });
  it('regression: high MCQ score but practical below 12/20 fails', () => {
    const r = scoreGrand(20, 100, 100, 55); // practical 11/20, total 41
    expect(r.pr).toBe(11); expect(r.total).toBe(41); expect(r.passed).toBe(false);
  });
  it('maximum is exactly 50', () => { expect(scoreGrand(20, 100, 100, 100).total).toBe(50); });
});
