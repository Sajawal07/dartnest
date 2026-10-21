import { describe, it, expect, beforeEach } from 'vitest';
import { actions, getState, __setBackend, __reload, memoryBackend, migrate, DB_KEY, SCHEMA_VERSION, transaction, type Backend } from '../src/domain/store';
import { project, progressionSelfTests, lockReason, nextAction } from '../src/domain/progression';

let backend: Backend;
beforeEach(() => { backend = memoryBackend(); __setBackend(backend); });

const passLesson = (n: number) => { actions.recordMcq({ lesson: n, score: 18, total: 20, weakSections: [], reviewLessons: [] }); actions.recordPractical({ lesson: n, taskId: 't' + n, score: 100, passed: true, status: 'graded', code: '' }); };
const passGrand = (k: number) => actions.recordGrand({ k, mcq: 18, coding: 10, practical: 16, total: 44 });
const passUpTo = (n: number) => { for (let i = 1; i <= n; i++) { passLesson(i); if (i % 5 === 0) passGrand(i / 5); } };

describe('Progression engine', () => {
  it('built-in boundary self-tests all pass (lessons 5, 10, 30, 70, 115, 120)', () => {
    expect(progressionSelfTests().filter((t) => !t.passed)).toEqual([]);
  });
  it('fresh install: only lesson 1 unlocked, with an explained lock on lesson 2', () => {
    const p = project(getState());
    expect(p.unlocked[1]).toBe(true); expect(p.unlocked[2]).toBe(false);
    expect(lockReason(p, 2)).toMatch(/Complete lesson 1/);
  });
  it('regression: 14/20 does not unlock; 15/20 + practical does', () => {
    actions.recordMcq({ lesson: 1, score: 14, total: 20, weakSections: [], reviewLessons: [] });
    actions.recordPractical({ lesson: 1, taskId: 't1', score: 100, passed: true, status: 'graded', code: '' });
    expect(project(getState()).unlocked[2]).toBe(false);
    actions.recordMcq({ lesson: 1, score: 15, total: 20, weakSections: [], reviewLessons: [] });
    expect(project(getState()).unlocked[2]).toBe(true);
  });
  it('regression: passing MCQ but failing the practical keeps the next lesson locked', () => {
    actions.recordMcq({ lesson: 1, score: 20, total: 20, weakSections: [], reviewLessons: [] });
    actions.recordPractical({ lesson: 1, taskId: 't1', score: 60, passed: false, status: 'graded', code: '' });
    expect(project(getState()).complete[1]).toBe(false);
    expect(project(getState()).unlocked[2]).toBe(false);
  });
  it('regression: completing five lessons without passing the grand test keeps lesson 6 locked', () => {
    for (let i = 1; i <= 5; i++) passLesson(i);
    let p = project(getState());
    expect(p.grandAvailable[1]).toBe(true); expect(p.unlocked[6]).toBe(false);
    expect(nextAction(p)).toEqual({ kind: 'grand', n: 1 });
    actions.recordGrand({ k: 1, mcq: 17, coding: 10, practical: 10, total: 37 }); // fails both rules
    p = project(getState());
    expect(p.unlocked[6]).toBe(false);
    expect(lockReason(p, 6)).toMatch(/Grand Test 1/);
    passGrand(1);
    expect(project(getState()).unlocked[6]).toBe(true);
  });
  it('regression: restarting the app after a successful exam keeps the result', () => {
    passLesson(1);
    __reload(); // simulated restart: memory dropped, storage re-read
    expect(getState().mcq).toHaveLength(1);
    expect(project(getState()).unlocked[2]).toBe(true);
  });
  it('regression: repeating a failed practical stores both attempts and unlocks after the pass', () => {
    actions.recordMcq({ lesson: 1, score: 16, total: 20, weakSections: [], reviewLessons: [] });
    actions.recordPractical({ lesson: 1, taskId: 't1', score: 40, passed: false, status: 'graded', code: 'v1' });
    expect(project(getState()).unlocked[2]).toBe(false);
    actions.recordPractical({ lesson: 1, taskId: 't1', score: 90, passed: true, status: 'graded', code: 'v2' });
    expect(getState().practical.map((p) => p.score)).toEqual([40, 90]);
    expect(project(getState()).unlocked[2]).toBe(true);
  });
  it('failed attempts persist and retakes never delete earlier results', () => {
    actions.recordMcq({ lesson: 1, score: 9, total: 20, weakSections: ['Concept'], reviewLessons: [1] });
    actions.recordMcq({ lesson: 1, score: 19, total: 20, weakSections: [], reviewLessons: [] });
    actions.recordMcq({ lesson: 1, score: 2, total: 20, weakSections: [], reviewLessons: [] });
    __reload();
    expect(getState().mcq.map((a) => a.score)).toEqual([9, 19, 2]);
    expect(project(getState()).mcqPassed[1]).toBe(true);
  });
  it('regression: invalid local state cannot unlock lessons', () => {
    backend.setItem(DB_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      mcq: [{ id: 'x', lesson: 50, score: 20, total: 20, passed: true }, { id: 'y', lesson: 2, score: 25, total: 20, passed: true }, { id: 'z', lesson: 1, score: 3, total: 20, passed: true }],
      practical: [{ id: 'p', lesson: 50, score: 100, passed: true }, { id: 'q', lesson: 1, score: 10, passed: true }],
      grand: [{ id: 'g', k: 1, mcq: 20, coding: 10, practical: 5, total: 50, passed: true }],
      unlocked: [1, 2, 3, 50],
    }));
    __reload();
    const s = getState(); const p = project(s);
    expect(s.mcq.find((a) => a.id === 'y')).toBeUndefined(); // impossible score dropped
    expect(s.mcq.find((a) => a.id === 'z')!.passed).toBe(false); // tampered flag recomputed
    expect(s.practical.find((a) => a.id === 'q')!.passed).toBe(false);
    expect(s.grand[0].total).toBe(35); expect(s.grand[0].passed).toBe(false); // total recomputed from parts
    expect(p.complete[50]).toBe(false); expect(p.unlocked[2]).toBe(false); expect(p.completedCount).toBe(0);
  });
  it('lesson 30 and 120 boundaries through the real store', () => {
    passUpTo(30);
    expect(project(getState()).unlocked[31]).toBe(true);
    for (let i = 31; i <= 120; i++) { passLesson(i); if (i % 5 === 0) passGrand(i / 5); }
    const p = project(getState());
    expect(p.completedCount).toBe(120); expect(p.grandPassed.filter(Boolean)).toHaveLength(24); expect(nextAction(p).kind).toBe('done');
  });
  it('progress reset requires explicit action, clears attempts and keeps snippets/settings', () => {
    passLesson(1); actions.saveSnippet('mine', 'void main() {}'); actions.settings({ theme: 'dark' });
    actions.resetProgress();
    __reload();
    expect(getState().mcq).toHaveLength(0); expect(getState().practical).toHaveLength(0);
    expect(getState().snippets).toHaveLength(1); expect(getState().settings.theme).toBe('dark');
    expect(project(getState()).unlocked[2]).toBe(false);
  });
});

describe('Local database', () => {
  it('migrates a v0/v1 document to the current schema', () => {
    const v1 = { version: 1, mcq: [], snippets: [{ id: 's', name: 'a', code: 'x', updatedAt: 1 }], settings: { theme: 'dark' } };
    const m = migrate(v1);
    expect(m.from).toBe(1); expect(m.steps).toEqual([1]); expect(m.state.schemaVersion).toBe(2);
    expect(m.state.bookmarks).toEqual([]); expect(m.state.settings.runTimeout).toBe(3000);
    expect(migrate({}).steps).toEqual([0, 1]);
    backend.setItem(DB_KEY, JSON.stringify(v1));
    __reload();
    expect(getState().schemaVersion).toBe(2); expect(getState().snippets[0].name).toBe('a'); expect(getState().settings.theme).toBe('dark');
    expect(JSON.parse(backend.getItem(DB_KEY)!).schemaVersion).toBe(2); // migrated document written back
  });
  it('rejects data from a newer schema without crashing', () => {
    backend.setItem(DB_KEY, JSON.stringify({ schemaVersion: 99 }));
    __reload();
    expect(getState().mcq).toEqual([]);
  });
  it('transactional writes: invalid records are rejected and nothing changes', () => {
    const before = getState();
    expect(() => transaction((s) => ({ ...s, mcq: [...s.mcq, { id: 'bad', lesson: 999, score: 50, total: 20 } as any] }))).toThrow(/rejected/);
    expect(getState()).toBe(before);
    expect(backend.getItem(DB_KEY)).toBeNull();
  });
  it('a failed storage write leaves in-memory state untouched', () => {
    const failing: Backend = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} };
    __setBackend(failing);
    expect(() => actions.saveSnippet('x', 'y')).toThrow(/Quota/);
    expect(getState().snippets).toHaveLength(0);
  });
  it('snippets persist across restarts and can be overwritten and deleted', () => {
    const sn = actions.saveSnippet('Counter', 'void main() { print(1); }');
    __reload();
    expect(getState().snippets[0]).toMatchObject({ name: 'Counter', code: 'void main() { print(1); }' });
    actions.saveSnippet('Counter', 'void main() { print(2); }', sn.id);
    __reload();
    expect(getState().snippets).toHaveLength(1); expect(getState().snippets[0].code).toContain('print(2)');
    actions.deleteSnippet(sn.id); __reload();
    expect(getState().snippets).toHaveLength(0);
  });
  it('theme, reduced-motion and editor settings persist (and are validated)', () => {
    actions.settings({ theme: 'dark', reducedMotion: true, editorFont: 99, runTimeout: 60000 });
    __reload();
    expect(getState().settings).toMatchObject({ theme: 'dark', reducedMotion: true, editorFont: 24, runTimeout: 10000 });
  });
  it('bookmarks and notes persist', () => {
    actions.toggleBookmark(42); actions.saveNote(42, 'Remember Navigator.pop');
    __reload();
    expect(getState().bookmarks).toEqual([42]); expect(getState().notes['42']).toBe('Remember Navigator.pop');
    actions.toggleBookmark(42); actions.saveNote(42, '  ');
    expect(getState().bookmarks).toEqual([]); expect(getState().notes['42']).toBeUndefined();
  });
  it('export → import round trip merges data without duplicates', () => {
    passLesson(1); actions.saveSnippet('A', 'x');
    const dump = actions.exportData();
    __setBackend(memoryBackend());
    actions.importData(dump); actions.importData(dump);
    expect(getState().mcq).toHaveLength(1); expect(getState().snippets).toHaveLength(1);
    expect(project(getState()).unlocked[2]).toBe(true);
    expect(() => actions.importData('{"app":"other"}')).toThrow();
  });
});
