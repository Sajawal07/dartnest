import { useMemo, useState } from 'react';
import { Workspace } from '../ui/Workspace';
import { Btn, Card, Badge, CodeBlock, Empty } from '../ui/kit';
import { useStore, actions } from '../domain/store';
import { project } from '../domain/progression';
import { LESSONS, practiceSet, PROJECTS, lesson, type PracticeKind, type PracticeItem } from '../data/curriculum';
import { TASKS } from '../data/tasks';
import { PracticalRunner } from '../ui/Assess';
import { WIDGETS } from '../engine/flutter';
import { go } from '../ui/router';

const M = "import 'package:flutter/material.dart';\n\n";
export const TEMPLATES: Record<string, string> = {
  'Hello Dart': "void main() {\n  final name = 'Flutter';\n  var count = 3;\n  for (var i = 1; i <= count; i++) {\n    print('Hello $name #$i');\n  }\n  final langs = ['Dart', 'Kotlin', 'Swift'];\n  print(langs.where((l) => l.length == 4).toList());\n}\n",
  'Counter app': `${M}void main() {\n  runApp(const MyApp());\n}\n\nclass MyApp extends StatelessWidget {\n  const MyApp({super.key});\n\n  @override\n  Widget build(BuildContext context) {\n    return MaterialApp(\n      theme: ThemeData(colorSchemeSeed: Colors.indigo),\n      home: const CounterPage(),\n    );\n  }\n}\n\nclass CounterPage extends StatefulWidget {\n  const CounterPage({super.key});\n\n  @override\n  State<CounterPage> createState() => _CounterPageState();\n}\n\nclass _CounterPageState extends State<CounterPage> {\n  int _count = 0;\n\n  @override\n  Widget build(BuildContext context) {\n    return Scaffold(\n      appBar: AppBar(title: const Text('Counter')),\n      body: Center(\n        child: Column(\n          mainAxisAlignment: MainAxisAlignment.center,\n          children: [\n            const Text('You pressed the button:'),\n            Text('$_count', style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold)),\n          ],\n        ),\n      ),\n      floatingActionButton: FloatingActionButton(\n        onPressed: () => setState(() => _count++),\n        tooltip: 'Increment',\n        child: const Icon(Icons.add),\n      ),\n    );\n  }\n}\n`,
  'Todo list': TASKS[69].solution,
  'Form validation': TASKS[36].solution,
  'Navigation': TASKS[41].solution,
  'Layout playground': `${M}void main() {\n  runApp(MaterialApp(\n    home: Scaffold(\n      appBar: AppBar(title: const Text('Layout')),\n      body: Padding(\n        padding: const EdgeInsets.all(16),\n        child: Column(\n          crossAxisAlignment: CrossAxisAlignment.start,\n          children: [\n            Row(children: [\n              Expanded(flex: 2, child: Container(height: 60, color: Colors.indigo)),\n              const SizedBox(width: 8),\n              Expanded(child: Container(height: 60, color: Colors.teal)),\n            ]),\n            const SizedBox(height: 16),\n            Container(\n              padding: const EdgeInsets.all(16),\n              decoration: BoxDecoration(color: Colors.amber, borderRadius: BorderRadius.circular(16)),\n              child: const Text('Rounded box'),\n            ),\n            const Card(child: ListTile(leading: Icon(Icons.star), title: Text('Card + ListTile'), subtitle: Text('Tap Inspect to explore'))),\n          ],\n        ),\n      ),\n    ),\n  ));\n}\n`,
  'Classes & inheritance': "abstract class Shape {\n  double area();\n  @override\n  String toString() => '${runtimeType}(${area().toStringAsFixed(2)})';\n}\n\nclass Circle extends Shape {\n  final double r;\n  Circle(this.r);\n  @override\n  double area() => 3.14159 * r * r;\n}\n\nclass Rect extends Shape {\n  final double w, h;\n  Rect(this.w, this.h);\n  @override\n  double area() => w * h;\n}\n\nvoid main() {\n  final shapes = <Shape>[Circle(1), Rect(2, 3)];\n  shapes.sort((a, b) => a.area().compareTo(b.area()));\n  for (final s in shapes) print(s);\n}\n",
  'Async & errors': "Future<int> fetchScore(String user) async {\n  await Future.delayed(const Duration(milliseconds: 200));\n  if (user.isEmpty) throw FormatException('empty user');\n  return user.length * 10;\n}\n\nvoid main() async {\n  print(await fetchScore('ada'));\n  try {\n    await fetchScore('');\n  } on FormatException catch (e) {\n    print('Caught: $e');\n  }\n}\n",
};

export const FEATURE_STAGES: [string, string, string][] = [
  ['Stage 1', 'Variables, literals, functions', 'var/final/const, int/double/String/bool literals, interpolation, top-level & local functions, arrow bodies, positional/optional/named parameters'],
  ['Stage 2', 'Collections & conditions', 'List/Map/Set literals, indexing, spreads, collection-if/for, if/else, ternary, switch, loops, break/continue'],
  ['Stage 3', 'Null safety & errors', 'nullable types, ?. ?? ??= !, late, throw/try/on/catch/finally, built-in exceptions, type checks and casts'],
  ['Stage 4', 'Classes & types', 'constructors (named/factory/redirecting/initializer lists), getters/setters, inheritance, abstract/implements, mixins, enums, generics, operators'],
  ['Stage 5', 'Async & libraries', 'async/await, Future API (resolved in program order), dart:math, dart:convert'],
  ['Stage 6', 'Widget declarations', 'StatelessWidget, StatefulWidget/State lifecycle, setState, keys, Navigator, Form/validation, controllers, theming'],
];
export const SUPPORTED = {
  dart: ['Variables: var, final, const (const collections are unmodifiable), late, typed declarations with runtime type checks', 'int/double distinction (/ always yields double; ~/ and % semantics), String interpolation, raw & multi-line strings', 'Null safety: nullable types, ?., ??, ??=, !, null-check errors, short-circuiting ?. chains', 'if/else, ternary, switch statements (no fall-through), switch expressions with constant, type and _ patterns', 'for, for-in (with concurrent-modification detection), while, do-while, break, continue', 'Functions: positional, optional [ ], named { } with required/defaults, arrow bodies, closures, generic type parameters', 'Classes: fields, constructors with this./super. params, initializer lists, named & factory & redirecting constructors, getters/setters, static members, operator overloading', 'Inheritance, abstract classes, implements, mixins (with), enums (.name, .index, .values), is/as', 'Collections: List/Map/Set literals, spreads, collection-if/for, rich methods (map/where/fold/sort/…)', 'Exceptions: throw, try/on/catch/finally, rethrow, built-in Exception/FormatException/StateError/…', 'async/await and Future (value, delayed, wait, then, catchError) — resolved synchronously in program order', 'dart:math (sqrt, pow, max, min, pi, seeded Random) and dart:convert (jsonEncode/jsonDecode)'],
  analysisOnly: ['Extension methods, typedefs, records, sealed-class exhaustiveness checking, guard clauses (when), destructuring patterns', 'Streams / await for, generators (sync*/async*), isolates, timers, real event-loop ordering', 'Imports other than package:flutter/material.dart, dart:math, dart:convert, dart:async'],
  limits: ['Runs execute first in an isolated Web Worker (no DOM, storage or app state). Stop cancels it instantly and a watchdog terminates it at the time limit (Settings, 0.5–10 s)', 'Main-thread re-run for interactive previews: 2,000,000 steps / 2.5 s; callbacks are budgeted per event; graded tests: 400k steps / 1.5 s', 'Call depth 300, collections ≤ 100,000 elements, output ≤ 2,000 lines', 'No filesystem, network, platform channels, host JavaScript or app data are reachable from user code'],
};

function SupportedPanel() {
  return <Card className="space-y-3 text-sm">
    <h3 className="font-semibold">Supported offline subset</h3>
    <p className="text-[var(--muted)]">The Code Lab runs Dart in a purpose-built interpreter that implements a documented subset. It does not compile full Flutter: widgets are rendered by a controlled preview engine.</p>
    <div><b>📈 Documented feature progression</b> <span className="text-[var(--muted)]">(each stage is covered by tests in tests/interpreter.test.ts; syntax is only added together with tests)</span>
      <ol className="mt-1 space-y-1">{FEATURE_STAGES.map(([st, t, d]) => <li key={st} className="rounded-lg bg-[var(--chip)] p-2"><b>{st} · {t}</b><div className="text-xs text-[var(--muted)]">{d}</div></li>)}</ol></div>
    <div><b>✅ Executable Dart</b><ul className="list-disc pl-5">{SUPPORTED.dart.map((x) => <li key={x}>{x}</li>)}</ul></div>
    <div><b>📖 Taught but analysis-only (reported as “Unsupported offline”)</b><ul className="list-disc pl-5">{SUPPORTED.analysisOnly.map((x) => <li key={x}>{x}</li>)}</ul></div>
    <div><b>🔎 Inspector two-way sync</b><p className="text-xs text-[var(--muted)]">Container, SizedBox, Padding, Align, Text, Icon, Row, Column, Expanded/Flexible/Spacer, Card, Divider, CircleAvatar, Opacity and ListTile properties can be edited in the preview. Edits rewrite the exact argument in your source using the parser's source ranges. Values computed by expressions, widgets created in loops, and non-literal decorations are flagged and stay read-only (or shared).</p></div>
    <div><b>🛡 Sandbox limits</b><ul className="list-disc pl-5">{SUPPORTED.limits.map((x) => <li key={x}>{x}</li>)}</ul></div>
    <div><b>🧩 Preview widgets ({Object.keys(WIDGETS).length})</b><div className="mt-1 flex flex-wrap gap-1">{Object.keys(WIDGETS).map((w) => <code key={w} className="rounded bg-[var(--chip)] px-1.5 py-0.5 text-xs">{w}</code>)}</div>
      <p className="text-xs text-[var(--muted)] mt-1">Plus StatelessWidget, StatefulWidget/State lifecycle (initState, didUpdateWidget, dispose, mounted), Navigator (push, pop, pushNamed, routes), Theme.of, MediaQuery, LayoutBuilder, Form/GlobalKey validation, TextEditingController, FocusNode, keys, SnackBar, showDialog, Colors, Icons (offline glyph set), EdgeInsets, BoxDecoration, TextStyle. Images render as placeholders (no network).</p></div>
  </Card>;
}

export function CodeLabPage() {
  const snippets = useStore((s) => s.snippets);
  const [code, setCode] = useState<string>(() => { const c = sessionStorage.getItem('lab-load'); sessionStorage.removeItem('lab-load'); return c ?? TEMPLATES['Counter app']; });
  const [name, setName] = useState('');
  const [panel, setPanel] = useState<'templates' | 'snippets' | 'supported'>('templates');
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end gap-2"><div><h1 className="text-2xl font-bold">Code Lab</h1><p className="text-sm text-[var(--muted)]">Offline Dart interpreter + controlled Flutter widget preview. Works in airplane mode.</p></div></header>
      <Workspace code={code} setCode={setCode} height={460} toolbar={<Btn kind="ghost" onClick={() => { if (confirm('Reset the editor to the Counter template?')) setCode(TEMPLATES['Counter app']); }}>⟲ Reset</Btn>} />
      <div className="flex gap-1" role="tablist">{(['templates', 'snippets', 'supported'] as const).map((t) => <button key={t} role="tab" aria-selected={panel === t} onClick={() => setPanel(t)} className={`rounded-xl px-3 py-1.5 text-sm capitalize ${panel === t ? 'bg-[var(--accent)] text-white' : 'bg-[var(--chip)]'}`}>{t === 'supported' ? 'Supported subset' : t}</button>)}</div>
      {panel === 'templates' && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.keys(TEMPLATES).map((k) => <button key={k} onClick={() => setCode(TEMPLATES[k])} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 text-left hover:border-[var(--accent)]"><div className="font-semibold text-sm">{k}</div><div className="text-xs text-[var(--muted)]">{TEMPLATES[k].includes('runApp') ? 'Flutter · preview' : 'Dart · console'}</div></button>)}</div>}
      {panel === 'snippets' && <Card className="space-y-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; actions.saveSnippet(name.trim(), code); setName(''); }}>
          <input aria-label="Snippet name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Snippet name" className="flex-1 rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm" />
          <Btn kind="primary" type="submit">💾 Save current code</Btn>
        </form>
        {snippets.length ? <ul className="divide-y divide-[var(--line)]">{snippets.map((s) => <li key={s.id} className="flex items-center gap-2 py-2 text-sm"><span className="font-medium truncate">{s.name}</span><span className="text-xs text-[var(--muted)]">{new Date(s.updatedAt).toLocaleString()}</span><Btn kind="ghost" className="ml-auto" onClick={() => setCode(s.code)}>Load</Btn><Btn kind="ghost" onClick={() => actions.saveSnippet(s.name, code, s.id)}>Overwrite</Btn><Btn kind="ghost" onClick={() => confirm(`Delete "${s.name}"?`) && actions.deleteSnippet(s.id)}>🗑</Btn></li>)}</ul>
          : <Empty icon="📂" title="No saved snippets" body="Snippets are stored on this device only. Export them from Settings." />}
      </Card>}
      {panel === 'supported' && <SupportedPanel />}
    </div>
  );
}

export function PracticePage() {
  const s = useStore((x) => x);
  const p = project(s);
  const available = LESSONS.filter((l) => p.unlocked[l.n]);
  const [sel, setSel] = useState<number[]>(() => [available[available.length - 1]?.n ?? 1]);
  const [kinds, setKinds] = useState<PracticeKind[]>(['mcq', 'output', 'debug', 'completion']);
  const [seed, setSeed] = useState(1);
  const [items, setItems] = useState<PracticeItem[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [challenge, setChallenge] = useState<number | null>(null);
  const acc = useMemo(() => { const m = new Map<string, { c: number; t: number }>(); for (const a of s.practice) { const e = m.get(a.kind) ?? { c: 0, t: 0 }; e.t++; if (a.correct) e.c++; m.set(a.kind, e); } return m; }, [s.practice]);
  const KL: Record<PracticeKind, string> = { mcq: 'Multiple choice', output: 'Predict the output', debug: 'Debugging', completion: 'Code completion' };
  if (challenge) {
    const t = TASKS[challenge - 1];
    return <div className="space-y-3"><Btn kind="ghost" onClick={() => setChallenge(null)}>← Back to practice</Btn><p className="text-sm text-[var(--muted)]">Practice mode — results are saved as practice and do not affect lesson progression.</p>
      <PracticalRunner task={t} draftKey={`practice-${challenge}`} onGraded={(r) => actions.recordPractice({ itemId: t.id + ':challenge', lesson: challenge, kind: t.kind === 'ui' ? 'widget' : 'coding', correct: r.passed })} /></div>;
  }
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Practice</h1><p className="text-sm text-[var(--muted)]">Drills from unlocked lessons. Practice never changes your lesson progression.</p></header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{(Object.keys(KL) as PracticeKind[]).map((k) => { const e = acc.get(k); return <div key={k} className="rounded-xl bg-[var(--chip)] p-3"><div className="text-xs text-[var(--muted)]">{KL[k]}</div><div className="font-bold tabular-nums">{e ? `${Math.round((e.c / e.t) * 100)}%` : '—'}</div><div className="text-xs text-[var(--muted)]">{e ? `${e.c}/${e.t} correct` : 'no attempts'}</div></div>; })}</div>
      <Card className="space-y-3">
        <div className="text-sm font-semibold">Topics (unlocked lessons)</div>
        <div className="flex flex-wrap gap-1 max-h-40 overflow-auto">{available.map((l) => <button key={l.n} onClick={() => setSel(sel.includes(l.n) ? sel.filter((x) => x !== l.n) : [...sel, l.n])} aria-pressed={sel.includes(l.n)} className={`rounded-full px-2.5 py-1 text-xs ${sel.includes(l.n) ? 'bg-[var(--accent)] text-white' : 'bg-[var(--chip)]'}`}>L{l.n} {l.title.length > 22 ? l.title.slice(0, 20) + '…' : l.title}</button>)}</div>
        <div className="flex flex-wrap gap-3 text-sm">{(Object.keys(KL) as PracticeKind[]).map((k) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])} />{KL[k]}</label>)}</div>
        <Btn kind="primary" disabled={!sel.length || !kinds.length} onClick={() => { setItems(practiceSet(sel, kinds, seed + Date.now() % 1000, 8)); setAnswers({}); setSeed(seed + 1); }}>Generate drill</Btn>
      </Card>
      {items && (items.length ? <div className="space-y-3">{items.map((it, i) => { const a = answers[it.id]; const done = a !== undefined; return <Card key={it.id} className="space-y-2 anim-up">
        <div className="flex items-center gap-2"><Badge tone="info">{KL[it.kind]}</Badge><span className="text-xs text-[var(--muted)]">Lesson {it.lesson} · {lesson(it.lesson).title}</span></div>
        <div className="font-medium text-sm whitespace-pre-wrap">{i + 1}. {it.prompt}</div>
        {it.code && <CodeBlock code={it.code} className="text-xs" />}
        <div className="grid gap-1.5">{it.options.map((o, k) => <button key={k} disabled={done} onClick={() => { setAnswers({ ...answers, [it.id]: k }); actions.recordPractice({ itemId: it.id, lesson: it.lesson, kind: it.kind, correct: k === it.answer }); }} className={`text-left rounded-xl border p-2.5 text-sm transition ${done && k === it.answer ? 'border-emerald-500 bg-emerald-500/10' + (k === a ? ' anim-pop' : '') : done && k === a ? 'border-red-500 bg-red-500/10 anim-shake' : 'border-[var(--line)] hover:bg-[var(--chip)]'}`}>{it.optionsAreCode ? <pre className="font-mono text-xs whitespace-pre-wrap">{o}</pre> : o}</button>)}</div>
        {done && <p className="text-sm text-[var(--muted)] whitespace-pre-wrap">{a === it.answer ? '✅ Correct. ' : '❌ Not quite. '}{it.explanation}</p>}
      </Card>; })}</div> : <Empty icon="🤷" title="No items" body="Pick other topics or question types." />)}
      <Card className="space-y-2">
        <h2 className="font-semibold">🧩 Widget-building & coding challenges</h2>
        <p className="text-sm text-[var(--muted)]">Practise any unlocked lesson's practical task with the full grader, without affecting progression.</p>
        <div className="grid gap-2 sm:grid-cols-2">{available.slice(-8).reverse().map((l) => <button key={l.n} onClick={() => setChallenge(l.n)} className="rounded-xl border border-[var(--line)] p-3 text-left text-sm hover:border-[var(--accent)]"><div className="font-medium">{TASKS[l.n - 1].title}</div><div className="text-xs text-[var(--muted)]">L{l.n} · {TASKS[l.n - 1].kind === 'ui' ? 'Widget-building' : 'Coding'}</div></button>)}</div>
      </Card>
    </div>
  );
}

export function ProjectsPage({ id }: { id?: string }) {
  const s = useStore((x) => x);
  const p = project(s);
  const best = (pid: string, tid: string) => Math.max(0, ...s.project.filter((a) => a.projectId === pid && a.taskId === tid).map((a) => a.score));
  const proj = PROJECTS.find((x) => x.id === id);
  const [m, setM] = useState(0);
  if (proj) {
    const locked = !p.complete[proj.unlockAfter];
    const ms = proj.milestones[m];
    return <div className="space-y-4">
      <Btn kind="ghost" onClick={() => go('/projects')}>← All projects</Btn>
      <Card className="space-y-2"><div className="flex flex-wrap gap-2"><Badge tone="info">{proj.level}</Badge>{proj.capstone && <Badge tone="warn">★ Capstone</Badge>}</div><h1 className="text-2xl font-bold">{proj.title}</h1><p className="text-sm">{proj.summary}</p>
        <div className="flex flex-wrap gap-1">{proj.skills.map((sk) => <Badge key={sk}>{sk}</Badge>)}</div>
        <div className="text-sm"><b>Requirements</b><ul className="list-disc pl-5">{proj.requirements.map((r) => <li key={r}>{r}</li>)}</ul></div>
        <div className="text-sm"><b>Completion rubric</b><ul className="list-disc pl-5">{proj.rubric.map((r) => <li key={r}>{r}</li>)}</ul></div>
      </Card>
      {locked ? <Card>🔒 Complete lesson {proj.unlockAfter} ({lesson(proj.unlockAfter).title}) to start this project.</Card> : <>
        <div className="flex flex-wrap gap-2">{proj.milestones.map((x, i) => { const b = best(proj.id, x.task.id); return <button key={i} onClick={() => setM(i)} className={`rounded-xl px-3 py-2 text-sm border ${i === m ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--line)]'}`}>{b >= 70 ? '✅' : '○'} Milestone {i + 1}: {x.task.title} <span className="text-[var(--muted)]">({x.weight} pts)</span></button>; })}</div>
        <PracticalRunner key={proj.id + m} task={ms.task} draftKey={`project-${proj.id}-${m}`} onGraded={(r) => { if (r.status !== 'unsupported') actions.recordProject({ projectId: proj.id, taskId: ms.task.id, score: r.score, passed: r.passed }); }} />
      </>}
    </div>;
  }
  return <div className="space-y-4">
    <header><h1 className="text-2xl font-bold">Projects</h1><p className="text-sm text-[var(--muted)]">Progressive multi-milestone builds with acceptance tests and rubrics.</p></header>
    {(['Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => <section key={lvl} className="space-y-2"><h2 className="font-semibold">{lvl}</h2>
    <div className="grid gap-3 sm:grid-cols-2">{PROJECTS.filter((pr) => pr.level === lvl).map((pr) => { const score = pr.milestones.reduce((a, x) => a + (best(pr.id, x.task.id) >= 70 ? x.weight : 0), 0); const locked = !p.complete[pr.unlockAfter]; return <button key={pr.id} onClick={() => go(`/projects/${pr.id}`)} className="text-left rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 space-y-2 hover:border-[var(--accent)]">
      <div className="flex items-center gap-2"><span className="font-semibold">{pr.title}</span><span className="ml-auto">{locked ? <Badge>🔒 after L{pr.unlockAfter}</Badge> : score === 100 ? <Badge tone="good">✅ Complete</Badge> : <Badge tone="info">{score}/100</Badge>}</span></div>
      <p className="text-sm text-[var(--muted)]">{pr.summary}</p>
      <div className="flex flex-wrap gap-1">{pr.capstone && <Badge tone="warn">★ Capstone</Badge>}{pr.skills.map((sk) => <Badge key={sk}>{sk}</Badge>)}<span className="text-xs text-[var(--muted)] ml-auto">{pr.milestones.length} milestones</span></div>
      <div className="h-2 rounded-full bg-[var(--chip)] overflow-hidden"><div className="h-full bg-[var(--accent)] transition-[width] duration-700" style={{ width: `${score}%` }} /></div>
    </button>; })}</div></section>)}
  </div>;
}
