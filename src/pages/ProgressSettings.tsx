import { useMemo, useState } from 'react';
import { useStore, actions } from '../domain/store';
import { project, progressionSelfTests } from '../domain/progression';
import { LESSONS, lesson, PROJECTS } from '../data/curriculum';
import { TASKS } from '../data/tasks';
import { grade } from '../engine/harness';
import { runProgram } from '../engine/runtime';
import { Btn, Card, Badge, Bar, Stat, Confirm, Empty } from '../ui/kit';
import { go } from '../ui/router';
import { verifyContent } from '../data/contentDb';
import { ALL_PROJECT_TASKS } from '../data/projects';
import { SCHEMA_VERSION, CONTENT_VERSION, lastLoadInfo } from '../domain/store';

export function ProgressPage() {
  const s = useStore((x) => x);
  const p = project(s);
  const mcqAcc = s.mcq.length ? s.mcq.reduce((a, x) => a + x.score, 0) / (s.mcq.length * 20) : null;
  const pracAcc = s.practical.length ? s.practical.reduce((a, x) => a + x.score, 0) / (s.practical.length * 100) : null;
  const topics = useMemo(() => {
    const m = new Map<number, { miss: number; att: number }>();
    for (const a of s.mcq) { const e = m.get(a.lesson) ?? { miss: 0, att: 0 }; e.att++; e.miss += 20 - a.score; m.set(a.lesson, e); }
    for (const a of s.practice) if (!a.correct) { const e = m.get(a.lesson) ?? { miss: 0, att: 0 }; e.miss++; m.set(a.lesson, e); }
    return [...m.entries()].map(([n, e]) => ({ n, rate: e.miss / Math.max(1, e.att * 20 + e.miss), miss: e.miss })).filter((x) => x.miss > 0).sort((a, b) => b.miss - a.miss).slice(0, 8);
  }, [s.mcq, s.practice]);
  const attempted = new Set([...s.mcq.map((a) => a.lesson), ...s.practical.map((a) => a.lesson)]).size;
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Progress</h1><p className="text-sm text-[var(--muted)]">Every number below is computed from attempts stored on this device.</p></header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Lessons attempted" value={attempted} />
        <Stat label="Lessons passed" value={p.completedCount} sub="exam + practical" />
        <Stat label="MCQ accuracy" value={mcqAcc === null ? '—' : `${Math.round(mcqAcc * 100)}%`} sub={`${s.mcq.length} exams`} />
        <Stat label="Practical accuracy" value={pracAcc === null ? '—' : `${Math.round(pracAcc * 100)}%`} sub={`${s.practical.length} submissions`} />
      </div>
      <Card className="space-y-2">
        <h2 className="font-semibold">Curriculum map</h2>
        <div className="grid grid-cols-10 sm:grid-cols-20 gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(22px, 1fr))' }}>
          {LESSONS.map((l) => <button key={l.n} title={`L${l.n} ${l.title}`} aria-label={`Lesson ${l.n} ${p.complete[l.n] ? 'complete' : p.unlocked[l.n] ? 'unlocked' : 'locked'}`} onClick={() => go(`/lesson/${l.n}`)} className={`aspect-square rounded text-[9px] tabular-nums ${p.complete[l.n] ? 'bg-emerald-500 text-white' : p.unlocked[l.n] ? 'bg-[var(--accent)] text-white' : 'bg-[var(--chip)] text-[var(--muted)]'}`}>{l.n}</button>)}
        </div>
        <div className="flex gap-3 text-xs text-[var(--muted)]"><span>■ <span className="text-emerald-500">complete</span></span><span>■ <span className="text-[var(--accent)]">unlocked</span></span><span>■ locked</span></div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="font-semibold">Topic-wise weaknesses</h2>
          {topics.length ? topics.map((t) => <button key={t.n} onClick={() => go(`/lesson/${t.n}`)} className="block w-full text-left"><div className="flex text-sm"><span className="truncate">L{t.n} {lesson(t.n).title}</span><span className="ml-auto text-[var(--muted)]">{t.miss} missed</span></div><Bar value={Math.min(100, t.rate * 100)} tone="bad" label="miss rate" /></button>) : <Empty icon="💪" title="No weaknesses detected yet" body="Missed questions in exams and practice will appear here." />}
        </Card>
        <Card className="space-y-2">
          <h2 className="font-semibold">Grand-test history</h2>
          {s.grand.length ? <table className="w-full text-sm"><thead className="text-xs text-[var(--muted)]"><tr><th className="text-left">Test</th><th>MCQ</th><th>Coding</th><th>Practical</th><th>Total</th><th /></tr></thead><tbody>{[...s.grand].reverse().map((g) => <tr key={g.id} className="border-t border-[var(--line)] text-center tabular-nums"><td className="text-left">GT {g.k}</td><td>{g.mcq}/20</td><td>{g.coding}/10</td><td>{g.practical}/20</td><td className="font-semibold">{g.total}/50</td><td><Badge tone={g.passed ? 'good' : 'bad'}>{g.passed ? 'Pass' : 'Fail'}</Badge></td></tr>)}</tbody></table> : <Empty icon="🏆" title="No grand tests yet" body="Grand tests unlock after every five completed lessons." />}
        </Card>
        <Card className="space-y-2">
          <h2 className="font-semibold">Project milestones</h2>
          {PROJECTS.map((pr) => { const done = pr.milestones.filter((m) => s.project.some((a) => a.projectId === pr.id && a.taskId === m.task.id && a.passed)).length; return <div key={pr.id} className="text-sm"><div className="flex"><span>{pr.title}</span><span className="ml-auto text-[var(--muted)]">{done}/{pr.milestones.length}</span></div><Bar value={done} max={pr.milestones.length} label={pr.title} /></div>; })}
        </Card>
        <Card className="space-y-2">
          <h2 className="font-semibold">Revision recommendations</h2>
          {(() => {
            const failed = [...new Set(s.mcq.filter((a) => !p.mcqPassed[a.lesson]).map((a) => a.lesson))];
            const pracFail = [...new Set(s.practical.filter((a) => !p.practicalPassed[a.lesson]).map((a) => a.lesson))];
            const recs = [...failed.map((n) => `Retake the lesson ${n} exam after re-reading “${lesson(n).title}”.`), ...pracFail.map((n) => `Revisit the practical for lesson ${n} (${TASKS[n - 1].title}) — use the hints.`), ...topics.slice(0, 3).map((t) => `Drill lesson ${t.n} in Practice (${t.miss} missed questions).`)];
            return recs.length ? <ul className="list-disc pl-5 text-sm space-y-1">{recs.slice(0, 8).map((r) => <li key={r}>{r}</li>)}</ul> : <p className="text-sm text-[var(--muted)]">No recommendations yet.</p>;
          })()}
        </Card>
      </div>
    </div>
  );
}

type DiagRow = { group: string; name: string; passed: boolean; detail?: string };
const ENGINE_TESTS: [string, string, string][] = [
  ['int/double division', 'void main() { print(5 / 2); print(4 / 2); print(7 ~/ 2); }', '2.5\n2.0\n3'],
  ['String interpolation', "void main() { var n = 'Dart'; print('Hi $n ${n.length}'); }", 'Hi Dart 4'],
  ['Null-aware operators', "void main() { String? s; print(s?.length ?? -1); s ??= 'x'; print(s); }", '-1\nx'],
  ['Collections & lazy iterables', 'void main() { print([1,2,3].map((x) => x * 2)); print({1,1,2}); }', '(2, 4, 6)\n{1, 2}'],
  ['Classes & inheritance', "class A { String f() => 'A'; } class B extends A { @override String f() => 'B' + super.f(); } void main() { print(B().f()); }", 'BA'],
  ['Enum + switch expression', "enum C { r, g } void main() { print(switch (C.g) { C.r => 'red', C.g => 'green' }); }", 'green'],
  ['Exceptions', "void main() { try { int.parse('x'); } on FormatException { print('caught'); } finally { print('done'); } }", 'caught\ndone'],
  ['async/await', 'Future<int> f() async => 21; void main() async { print(await f() * 2); }', '42'],
  ['Closures capture loop variable', 'void main() { final fs = []; for (var i = 0; i < 3; i++) { fs.add(() => i); } print(fs.map((f) => f()).toList()); }', '[0, 1, 2]'],
  ['Infinite loop is stopped', 'void main() { while (true) {} }', '!limit'],
  ['Runaway recursion is stopped', 'int f(int n) => f(n + 1); void main() { f(0); }', '!limit'],
  ['Truthiness rejected', "void main() { if (1) print('x'); }", '!compile'],
  ['Type error detected', "void main() { int x = 'a'; }", '!compile'],
  ['Unsupported import explained', "import 'dart:io'; void main() {}", '!unsupported'],
];

export function SettingsPage() {
  const s = useStore((x) => x.settings);
  const counts = useStore((x) => ({ a: x.mcq.length + x.practical.length + x.grand.length, sn: x.snippets.length }));
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [msg, setMsg] = useState('');
  const [diag, setDiag] = useState<DiagRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const runDiag = () => {
    setRunning(true);
    setTimeout(() => {
      const rows: DiagRow[] = [];
      verifyContent().forEach((c) => rows.push({ group: 'Content integrity', name: c.name, passed: c.passed, detail: c.detail }));
      progressionSelfTests().forEach((t) => rows.push({ group: 'Progression engine', ...t }));
      ALL_PROJECT_TASKS.forEach((t) => { const g = grade(t, t.solution); rows.push({ group: 'Project acceptance tests', name: `${t.id} ${t.title}: reference = 100`, passed: g.score === 100, detail: g.score !== 100 ? g.breakdown.filter((b) => !b.passed).map((b) => b.detail).join('; ') : undefined }); });
      for (const [name, src, exp] of ENGINE_TESTS) {
        const r = runProgram(src, { maxSteps: 300_000, maxMs: 800 });
        const ok = exp.startsWith('!') ? !r.ok && r.error?.kind === exp.slice(1) : r.ok && r.output.join('\n') === exp;
        rows.push({ group: 'Interpreter', name, passed: ok, detail: ok ? undefined : r.error?.message ?? r.output.join('\\n') });
      }
      TASKS.forEach((t, i) => { const g = grade(t, t.solution); const st = grade(t, t.starter); rows.push({ group: 'Assessment bank', name: `L${i + 1} ${t.title}: reference = 100, starter fails`, passed: g.score === 100 && !st.passed, detail: g.score !== 100 ? g.breakdown.filter((b) => !b.passed).map((b) => b.detail).join('; ') : undefined }); });
      setDiag(rows); setRunning(false);
    }, 30);
  };
  const download = () => { const blob = new Blob([actions.exportData()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `flutter-academy-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Settings</h1></header>
      <Card className="space-y-4">
        <h2 className="font-semibold">Appearance & editor</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="w-36">Theme</span>{(['light', 'dark', 'system'] as const).map((t) => <Btn key={t} kind={s.theme === t ? 'primary' : 'tonal'} onClick={() => actions.settings({ theme: t })} aria-pressed={s.theme === t}>{t === 'light' ? '☀ Light' : t === 'dark' ? '☾ Dark' : '⚙ System'}</Btn>)}</div>
        <label className="flex items-center gap-2 text-sm"><span className="w-36">Editor font size</span><input type="range" min={11} max={22} value={s.editorFont} onChange={(e) => actions.settings({ editorFont: Number(e.target.value) })} /><span className="tabular-nums">{s.editorFont}px</span></label>
        <label className="flex items-center gap-2 text-sm"><span className="w-36">Run time limit</span><input type="range" min={500} max={10000} step={500} value={s.runTimeout} onChange={(e) => actions.settings({ runTimeout: Number(e.target.value) })} /><span className="tabular-nums">{(s.runTimeout / 1000).toFixed(1)} s</span><span className="text-[var(--muted)] text-xs">Isolated worker is terminated after this (Stop cancels sooner)</span></label>
        <label className="flex items-center gap-2 text-sm"><span className="w-36">Line numbers</span><input type="checkbox" checked={s.lineNumbers} onChange={(e) => actions.settings({ lineNumbers: e.target.checked })} /></label>
        <label className="flex items-center gap-2 text-sm"><span className="w-36">Reduced motion</span><input type="checkbox" checked={s.reducedMotion} onChange={(e) => actions.settings({ reducedMotion: e.target.checked })} /><span className="text-[var(--muted)] text-xs">Disables UI and preview animations</span></label>
        <label className="flex items-center gap-2 text-sm"><span className="w-36">Default preview</span><select value={`${s.previewWidth}x${s.previewHeight}`} onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); actions.settings({ previewWidth: w, previewHeight: h }); }} className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-2 py-1">{[[320, 568], [360, 640], [412, 860], [600, 860]].map(([w, h]) => <option key={w} value={`${w}x${h}`}>{w}×{h}</option>)}</select></label>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Local data</h2>
        <p className="text-sm text-[var(--muted)]">All data stays on this device ({counts.a} assessment records, {counts.sn} snippets). No account, server or analytics.</p>
        <p className="text-xs text-[var(--muted)]">Database schema v{SCHEMA_VERSION} · content {CONTENT_VERSION}{lastLoadInfo.steps.length ? ` · migrated from v${lastLoadInfo.migratedFrom} this session` : ''}{lastLoadInfo.error ? ` · load error: ${lastLoadInfo.error}` : ''}. Assessment results are written synchronously in validated transactions.</p>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={download}>⬇ Export snippets & progress</Btn>
          <label className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--chip)] px-3.5 py-2 text-sm font-medium cursor-pointer hover:bg-[var(--chip-hover)]">⬆ Import<input type="file" accept="application/json" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setMsg(actions.importData(await f.text())); } catch (err: any) { setMsg('Import failed: ' + err.message); } e.target.value = ''; }} /></label>
          <Btn kind="danger" onClick={() => setConfirmReset(true)}>Reset learning progress</Btn>
          <Btn kind="outline" onClick={() => setConfirmAll(true)}>Erase everything</Btn>
        </div>
        {msg && <p className="text-sm" role="status">{msg}</p>}
        <p className="text-xs text-[var(--muted)]">Imported attempts are merged and re-validated: progression is always re-derived from results, so imported data cannot unlock lessons out of order.</p>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><h2 className="font-semibold">Diagnostics</h2><Btn kind="primary" className="ml-auto" onClick={runDiag} disabled={running}>{running ? 'Running…' : 'Run self-tests'}</Btn></div>
        <p className="text-sm text-[var(--muted)]">Runs the in-app subset of the automated test suite: content integrity (120 lessons, 20 MCQs each, answer keys, 24 grand tests), progression boundaries, interpreter semantics and sandbox limits, and every lesson and project reference solution. The full suite (npm test) has more.</p>
        {diag && (() => { const groups = [...new Set(diag.map((d) => d.group))]; return groups.map((g) => { const rows = diag.filter((d) => d.group === g); const ok = rows.filter((r) => r.passed).length; return <details key={g} className="rounded-xl border border-[var(--line)] p-3" open={ok !== rows.length}><summary className="cursor-pointer text-sm font-medium">{ok === rows.length ? '✅' : '❌'} {g}: {ok}/{rows.length} passed</summary><ul className="mt-2 space-y-0.5 text-xs max-h-64 overflow-auto">{rows.map((r) => <li key={r.name}>{r.passed ? '✓' : '✕'} {r.name}{r.detail && <span className="text-red-500"> — {r.detail}</span>}</li>)}</ul></details>; }); })()}
      </Card>
      <Card className="space-y-2"><h2 className="font-semibold">About & technical feasibility</h2><p className="text-sm text-[var(--muted)]">How this academy executes code offline, and what it can and cannot do.</p><Btn onClick={() => go('/about')}>Read the feasibility report →</Btn></Card>
      <Confirm open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset learning progress?" body="All exam, practical, grand-test, practice and project attempts will be permanently deleted. Snippets and settings are kept." confirmWord="RESET" onConfirm={() => { actions.resetProgress(); setMsg('Progress reset.'); }} />
      <Confirm open={confirmAll} onClose={() => setConfirmAll(false)} title="Erase all local data?" body="Deletes progress, snippets, drafts and settings from this device." confirmWord="ERASE" onConfirm={() => { actions.resetAll(); setMsg('All local data erased.'); }} />
    </div>
  );
}

export function AboutPage() {
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="font-semibold text-base pt-2">{children}</h2>;
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold">Technical feasibility & verification report</h1>
      <Card className="space-y-2 text-sm leading-relaxed">
        <H>1. Environment and target</H>
        <p>The specification targets a Flutter Android app. The delivery environment has a React + Vite + TypeScript toolchain and no Flutter SDK or Android toolchain, so <b>no APK/AAB was built</b>. The product ships as an offline single-file web application (the JavaScript, CSS, content and execution worker are all inlined into one HTML file) with the specified architecture: feature modules, a versioned local database, repositories, a domain progression service and a deterministic assessment engine.</p>
        <H>2. Offline code execution (no remote compiler)</H>
        <ul className="list-disc pl-5"><li><b>Lexer + recursive-descent parser</b> with line/column/offset ranges. No regex parsing.</li><li><b>Tree-walking interpreter</b> for a documented Dart subset in six feature stages (Code Lab → Supported subset). Stages are added only together with tests.</li><li><b>Isolation & cancellation</b>: each run executes first in an inline Web Worker with no DOM, storage or app state. Stop terminates it, and a watchdog kills it at the configured limit. Programs that call runApp are then re-run on the main thread with step, time, depth, collection and output limits so the preview can be interactive.</li><li><b>Allow-lists</b>: only listed natives, imports and ~70 widgets exist. Host globals (window, fetch, localStorage…) are unreachable (tested).</li><li><b>Flutter-accurate rebuilds</b>: a State rebuilds only after setState, a configuration change or a viewport change. Const instances are canonicalised, so mutations made without setState don't update the UI and fail grading.</li></ul>
        <H>3. Preview & inspector</H>
        <p>A controlled renderer (not the native Flutter engine) draws the widget subset with common properties and real interactions. The inspector rewrites the exact constructor argument in your source using AST ranges, then re-runs. Expression-valued properties, non-literal decorations and loop-generated widgets are clearly flagged as read-only or shared.</p>
        <H>4. Local database</H>
        <p>A versioned document database (schema v2) persisted in localStorage, with ordered migrations (v0→v1→v2). Writes are synchronous transactions that are validated, persisted, then published, and roll back on failure. Attempt tables are append-only. Unlock state is never stored: it is derived from validated attempts, so tampered data can't unlock lessons (tested). Content tables, the search index and integrity checks are built from bundled assets, with no network needed.</p>
        <H>5. Verification actually performed</H>
        <ul className="list-disc pl-5"><li><b>Automated suite (npm test)</b>: 145 tests in 6 files covering content completeness (120 IDs, exactly 20 MCQs each, answer-key integrity), exam/practical/grand scoring (14/15 and 37/38 boundaries, practical minimum), progression and unlocking, restarts, retakes, failed-attempt persistence, invalid-state rejection, reset, migrations, transactions, snippets, theme/reduced-motion persistence, interpreter stages, unsupported diagnostics, sandbox limits, widget rendering, button/state interactions, inspector sync, responsive rules, all 120 lesson solutions, all 32 project-milestone solutions, and render smoke tests of every screen. The last run passed all 145.</li><li><b>In-app Diagnostics</b> (Settings) re-runs content integrity, progression, interpreter and solution checks on the device.</li></ul>
        <H>6. Honest limitations</H>
        <ul className="list-disc pl-5"><li>Not an Android build. Low-end Android performance, TalkBack and true airplane-mode runs were <b>not</b> tested here: no device or browser automation was available. The app makes no network requests by design.</li><li>Not full Dart/Flutter. Streams, isolates, extensions, records and real event-loop timing are taught but analysis-only. Layout approximates Flutter constraints with CSS flexbox, and CustomPainter and network images aren't rendered.</li><li>Responsive behaviour is verified through pure layout rules and render tests, not visual screenshots.</li><li>Ints are JavaScript numbers (exact to 2⁵³). Question banks combine authored facts with engine-verified output questions and cumulative review items.</li></ul>
        <H>7. Path to native Android</H>
        <p>Curriculum data, rubrics, progression rules and the database schema are framework-independent. A Flutter port would use Riverpod, drift/sqflite tables mirroring the attempt records, and dart_eval/flutter_eval or a Dart port of this interpreter. Execution and performance must then be verified on the minimum supported Android version.</p>
      </Card>
    </div>
  );
}
