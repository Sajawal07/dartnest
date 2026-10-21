import { useMemo, useState, useEffect } from 'react';
import { LESSONS, lesson, lessonExam, gradeExam, lineNotes, exampleOutput, EXAM_PASS, type PublicQuestion, type ReviewItem, type Track } from '../data/curriculum';
import { useStore, actions } from '../domain/store';
import { project, lockReason } from '../domain/progression';
import { Btn, Card, Badge, CodeBlock, Section, Bar } from '../ui/kit';
import { ExamRunner, ExamReview, PracticalRunner } from '../ui/Assess';
import { Workspace } from '../ui/Workspace';
import { go } from '../ui/router';
import { exampleCategory, CATEGORY_INFO, searchLessons } from '../data/contentDb';

export function statusOf(p: ReturnType<typeof project>, n: number) {
  if (!p.unlocked[n]) return { label: 'Locked', tone: 'neutral' as const, icon: '🔒' };
  if (p.complete[n]) return { label: 'Completed', tone: 'good' as const, icon: '✅' };
  if (p.mcqPassed[n] || p.practicalPassed[n]) return { label: 'In progress', tone: 'warn' as const, icon: '◐' };
  return { label: 'Available', tone: 'info' as const, icon: '▶' };
}

export function LearnPage() {
  const hist = useStore((s) => s);
  const p = project(hist);
  const [q, setQ] = useState('');
  const [track, setTrack] = useState<'All' | Track>('All');
  const [status, setStatus] = useState('All');
  const bookmarks = hist.bookmarks;
  const list = useMemo(() => {
    const order = q.trim() ? searchLessons(q) : LESSONS.map((l) => l.n);
    return order.map((n) => LESSONS[n - 1]).filter((l) => (track === 'All' || l.track === track) && (status === 'All' || (status === 'Bookmarked' ? bookmarks.includes(l.n) : statusOf(p, l.n).label === status)));
  }, [q, track, status, p, bookmarks]);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end gap-2"><div><h1 className="text-2xl font-bold">Learn</h1><p className="text-sm text-[var(--muted)]">120 lessons · 24 grand tests · strict prerequisite progression</p></div><button onClick={() => go('/distinctions')} className="ml-auto rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm hover:border-[var(--accent)]">🧭 Core distinctions every Flutter developer must know</button></header>
      <div className="flex flex-wrap gap-2">
        <input type="search" aria-label="Search lessons" placeholder="Search by title, concept or keyword (e.g. setState, keys, 42)…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-[200px] rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2" />
        <select aria-label="Track filter" value={track} onChange={(e) => setTrack(e.target.value as any)} className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2">{['All', 'Beginner', 'Intermediate', 'Advanced'].map((t) => <option key={t}>{t}</option>)}</select>
        <select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2">{['All', 'Available', 'In progress', 'Completed', 'Locked', 'Bookmarked'].map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      <div className="grid gap-2">
        {list.map((l) => {
          const s = statusOf(p, l.n);
          const reason = lockReason(p, l.n);
          const showGrand = l.n % 5 === 0 && (track === 'All' || l.track === track) && !q && status === 'All';
          const k = l.n / 5;
          return <div key={l.n}>
            <button onClick={() => go(`/lesson/${l.n}`)} className={`w-full text-left rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 sm:p-4 flex gap-3 items-center hover:border-[var(--accent)] transition ${!p.unlocked[l.n] ? 'opacity-70' : ''}`}>
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl font-bold tabular-nums ${p.complete[l.n] ? 'bg-emerald-500/15 text-emerald-600' : p.unlocked[l.n] ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--chip)]'}`}>{l.n}</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{bookmarks.includes(l.n) && <span aria-label="Bookmarked" className="mr-1">🔖</span>}{l.title}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-[var(--muted)]">
                  <Badge>{l.track}</Badge><span>{'●'.repeat(l.difficulty)}{'○'.repeat(5 - l.difficulty)}</span><span>· {l.minutes} min</span>
                  <span>· Prereq: {l.prereqs.length ? l.prereqs.map((x) => `L${x}`).join(', ') : 'none'}</span>
                  <span>· Exam: {p.mcqPassed[l.n] ? '✓ passed' : hist.mcq.some((a) => a.lesson === l.n) ? '✕ not passed yet' : '—'}</span>
                  <span>· Practical: {p.practicalPassed[l.n] ? '✓' : '—'}</span>
                </div>
                {reason && <div className="text-xs mt-1 text-amber-700 dark:text-amber-400">🔒 {reason}</div>}
              </div>
              <Badge tone={s.tone}>{s.icon} {s.label}</Badge>
            </button>
            {showGrand && <button onClick={() => go(`/grand/${k}`)} className="mt-2 w-full rounded-2xl border-2 border-dashed border-[var(--line)] p-3 text-sm flex items-center gap-2 hover:border-[var(--accent)]">
              <span aria-hidden>🏆</span><b>Grand Test {k}</b><span className="text-[var(--muted)]">· lessons {l.n - 4}–{l.n} · 50 marks</span>
              <span className="ml-auto"><Badge tone={p.grandPassed[k] ? 'good' : p.grandAvailable[k] ? 'info' : 'neutral'}>{p.grandPassed[k] ? '✅ Passed' : p.grandAvailable[k] ? 'Available' : '🔒 Locked'}</Badge></span>
            </button>}
          </div>;
        })}
        {!list.length && <p className="text-center text-sm text-[var(--muted)] py-8">No lessons match your filters.</p>}
      </div>
    </div>
  );
}

function ExampleBlock({ ex, n, idx }: { ex: ReturnType<typeof lesson>['examples'][number]; n: number; idx: number }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(ex.code);
  const cat = exampleCategory(ex.code);
  const runnable = cat === 'interpreter';
  const out = idx === 0 ? exampleOutput(n) : null;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-sm">{idx + 1}. {ex.title}</h4><span title={CATEGORY_INFO[cat].help}><Badge tone={CATEGORY_INFO[cat].tone}>{CATEGORY_INFO[cat].label}{runnable && ex.code.includes('runApp') ? ' · live preview' : ''}</Badge></span>
      {runnable && <Btn kind="ghost" className="ml-auto" onClick={() => setOpen(!open)}>{open ? 'Hide editor' : '▶ Try it here'}</Btn>}
      {runnable && <Btn kind="ghost" onClick={() => { sessionStorage.setItem('lab-load', ex.code); go('/lab'); }}>Open in Code Lab</Btn>}</div>
    {open ? <Workspace code={code} setCode={setCode} height={260} autoRun showInspector={false} /> : <CodeBlock code={ex.code} />}
    <p className="text-xs text-[var(--muted)]">{ex.note} <i>{CATEGORY_INFO[cat].help}</i></p>
    {out && !open && <div className="text-xs"><div className="text-[var(--muted)] mb-1">Expected output (verified by running in the offline engine):</div><pre className="rounded-lg bg-[var(--chip)] p-2 font-mono whitespace-pre-wrap">{out}</pre></div>}
    {runnable && ex.code.includes('runApp') && !open && <p className="text-xs text-[var(--muted)]">Expected result: press “Try it here” to render the widget preview.</p>}
  </div>;
}

function LessonContent({ n }: { n: number }) {
  const l = lesson(n);
  const [reveal, setReveal] = useState(false);
  return <div className="space-y-6 prose-lesson">
    <Card className="space-y-4">
      <Section title="Learning objectives" icon="🎯"><ul className="list-disc pl-5 text-sm space-y-1">{l.objectives.map((o) => <li key={o}>{o}</li>)}</ul></Section>
      <Section title="Introduction" icon="👋"><p className="text-[15px]">{l.intro}</p></Section>
      <details open className="group"><summary className="cursor-pointer list-none flex items-center gap-2 font-semibold"><span aria-hidden>🧠</span>Concept in depth<span className="ml-auto text-xs text-[var(--muted)] transition group-open:rotate-180">▾</span></summary><p className="text-[15px] mt-2 anim-fade">{l.concept}</p></details>
      <Section title="Syntax & terminology" icon="📖"><dl className="grid gap-2">{l.terms.map(([t, d]) => <div key={t} className="rounded-xl bg-[var(--chip)] p-3"><dt className="font-mono font-semibold text-sm">{t}</dt><dd className="text-sm">{d}</dd></div>)}</dl></Section>
    </Card>
    <Card className="space-y-5">
      <Section title="Code examples (increasing complexity)" icon="💻">{l.examples.map((ex, i) => <ExampleBlock key={i} ex={ex} n={n} idx={i} />)}</Section>
      <Section title="Line-by-line explanation (worked example)" icon="🔎">
        <ol className="space-y-1 text-sm">{lineNotes(l.examples[0].code).map((x) => <li key={x.line} className="flex gap-2"><span className="tabular-nums text-[var(--muted)] w-8 shrink-0">L{x.line}</span><code className="font-mono text-xs bg-[var(--chip)] rounded px-1 py-0.5 shrink-0 max-w-[45%] truncate">{x.text}</code><span>{x.note}</span></li>)}</ol>
      </Section>
    </Card>
    <Card className="grid gap-4 sm:grid-cols-2">
      <Section title="Why it exists" icon="❓"><p className="text-sm">{l.why}</p></Section>
      <Section title="Real-world use cases" icon="🌍"><p className="text-sm">{l.uses}</p></Section>
      <Section title="When to use" icon="✅"><p className="text-sm">{l.when}</p></Section>
      <Section title="When not to use" icon="⛔"><p className="text-sm">{l.whenNot}</p></Section>
      <Section title="Advantages" icon="➕"><p className="text-sm">{l.pros}</p></Section>
      <Section title="Disadvantages" icon="➖"><p className="text-sm">{l.cons}</p></Section>
    </Card>
    <Card className="space-y-3">
      <Section title="Common mistake & debugging challenge" icon="🐞">
        <p className="text-sm">Find the bug before revealing the explanation:</p>
        <div className="text-xs text-red-600 dark:text-red-400 font-semibold">✕ Incorrect</div><CodeBlock code={l.mistake.bad} />
        {!reveal ? <Btn onClick={() => setReveal(true)}>Reveal explanation & fix</Btn> : <>
          <p className="text-sm rounded-xl bg-amber-500/10 p-3">💡 {l.mistake.why}</p>
          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">✓ Corrected</div><CodeBlock code={l.mistake.good} />
        </>}
      </Section>
    </Card>
    <Card className="space-y-3">
      <Section title="Summary" icon="📝"><ul className="list-disc pl-5 text-sm space-y-1">{l.summary.map((s) => <li key={s}>{s}</li>)}</ul></Section>
      <Section title="Revision questions" icon="🔁"><ol className="list-decimal pl-5 text-sm space-y-1">{l.revision.map((s) => <li key={s}>{s}</li>)}</ol></Section>
      <Section title="Related concepts" icon="🔗"><ul className="text-sm space-y-1">{l.related.map((s) => <li key={s}>• {s}</li>)}</ul></Section>
      <Section title="Practical exercise" icon="🛠"><p className="text-sm">{l.task.statement} <button className="underline" onClick={() => go(`/lesson/${n}/practical`)}>Open the practical →</button></p></Section>
    </Card>
  </div>;
}

function LessonExam({ n }: { n: number }) {
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const exam = useMemo(() => lessonExam(n, seed), [n, seed]);
  const [result, setResult] = useState<{ score: number; total: number; review: ReviewItem[]; questions: PublicQuestion[] } | null>(null);
  const attempts = useStore((s) => s.mcq.filter((a) => a.lesson === n));
  if (result) return <ExamReview {...result} passMark={EXAM_PASS} onRetry={() => { setResult(null); setSeed(seed + 1); }} />;
  return <div className="space-y-3">
    {attempts.length > 0 && <p className="text-sm text-[var(--muted)]">Previous attempts: {attempts.map((a) => `${a.score}/20`).join(', ')} · best {Math.max(...attempts.map((a) => a.score))}/20</p>}
    <ExamRunner key={seed} title={`Lesson ${n} exam · 20 questions · pass ≥ 15/20`} questions={exam.questions} onSubmit={(answers) => {
      const g = gradeExam(exam.sessionId, answers);
      const wrong = g.review.filter((r) => !r.correct);
      actions.recordMcq({ lesson: n, score: g.score, total: g.total, weakSections: [...new Set(wrong.map((w) => w.section))], reviewLessons: [...new Set(wrong.map((w) => w.lesson))] });
      setResult({ ...g, questions: exam.questions });
    }} />
  </div>;
}

export function LessonPage({ n, tab }: { n: number; tab: string }) {
  const hist = useStore((s) => s);
  const p = project(hist);
  const l = lesson(n);
  useEffect(() => { if (p.unlocked[n]) actions.setLastLesson(n); }, [n, p.unlocked[n]]);
  if (!l) return <p>Lesson not found.</p>;
  const reason = lockReason(p, n);
  const tabs = [['content', '📘 Lesson'], ['exam', '📝 Exam'], ['practical', '🛠 Practical']];
  return (
    <div className="space-y-4">
      <div className="gradient-hero rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5 space-y-3 anim-up">
        <div className="flex flex-wrap items-center gap-2 text-xs"><button onClick={() => go('/learn')} className="underline">Learn</button><span>›</span><span>Lesson {n}</span><Badge>{l.track}</Badge><Badge>{l.id}</Badge><span className="text-[var(--muted)]">{'●'.repeat(l.difficulty)}{'○'.repeat(5 - l.difficulty)} · {l.minutes} min</span></div>
        <h1 className="text-2xl sm:text-3xl font-bold">{l.title}</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge tone={p.mcqPassed[n] ? 'good' : 'neutral'}>{p.mcqPassed[n] ? '✓' : '○'} Exam ≥ 15/20</Badge>
          <Badge tone={p.practicalPassed[n] ? 'good' : 'neutral'}>{p.practicalPassed[n] ? '✓' : '○'} Practical ≥ 70%</Badge>
          {p.complete[n] && <Badge tone="good">🎉 Lesson complete</Badge>}
        </div>
        <div className="flex flex-wrap gap-2"><Btn kind={hist.bookmarks.includes(n) ? 'primary' : 'outline'} aria-pressed={hist.bookmarks.includes(n)} onClick={() => actions.toggleBookmark(n)}>{hist.bookmarks.includes(n) ? '🔖 Bookmarked' : '🔖 Bookmark'}</Btn><Btn kind="outline" onClick={() => document.getElementById('lesson-notes')?.scrollIntoView({ behavior: 'smooth' })}>✎ Notes{hist.notes[n] ? ' •' : ''}</Btn></div>
        {reason && <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 p-3 text-sm">🔒 <b>Locked.</b> {reason} You can still read the lesson, but assessments are disabled.</div>}
      </div>
      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-[var(--bg)]/90 backdrop-blur flex gap-1" role="tablist">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(`/lesson/${n}${k === 'content' ? '' : '/' + k}`)} className={`rounded-xl px-4 py-2 text-sm font-medium ${tab === k ? 'bg-[var(--accent)] text-white' : 'bg-[var(--chip)]'}`}>{label}</button>)}
        <div className="ml-auto flex gap-1">
          <Btn kind="ghost" disabled={n === 1} onClick={() => go(`/lesson/${n - 1}`)} aria-label="Previous lesson">←</Btn>
          <Btn kind="ghost" disabled={n === 120} onClick={() => go(`/lesson/${n + 1}`)} aria-label="Next lesson">→</Btn>
        </div>
      </div>
      {tab === 'content' && <LessonContent n={n} />}
      {tab === 'exam' && (reason ? <Card>🔒 {reason}</Card> : <LessonExam n={n} />)}
      {tab === 'practical' && (reason ? <Card>🔒 {reason}</Card> : <PracticalRunner task={l.task} draftKey={`lesson-${n}`} onGraded={(r, code) => { if (r.status !== 'unsupported') actions.recordPractical({ lesson: n, taskId: l.task.id, score: r.score, passed: r.passed, status: r.status, code }); }} />)}
      <NotesCard n={n} />
      {p.complete[n] && n % 5 === 0 && !p.grandPassed[n / 5] && <Card className="flex items-center gap-3"><span className="text-2xl">🏆</span><div className="flex-1"><b>Grand Test {n / 5} is available.</b><div className="text-sm text-[var(--muted)]">Pass it to unlock lessons {n + 1}–{n + 5}.</div></div><Btn kind="primary" onClick={() => go(`/grand/${n / 5}`)}>Start</Btn></Card>}
      {p.complete[n] && p.unlocked[n + 1] && n < 120 && <Card className="flex items-center gap-3"><Bar value={100} tone="good" /><Btn kind="primary" onClick={() => go(`/lesson/${n + 1}`)}>Next lesson →</Btn></Card>}
    </div>
  );
}

function NotesCard({ n }: { n: number }) {
  const saved = useStore((s) => s.notes[n] ?? '');
  const [text, setText] = useState(saved);
  const [status, setStatus] = useState('');
  useEffect(() => setText(saved), [n]);
  return <Card id="lesson-notes" className="space-y-2">
    <div className="flex items-center gap-2"><h3 className="font-semibold">✎ My notes</h3><span className="ml-auto text-xs text-[var(--muted)]" aria-live="polite">{status}</span></div>
    <textarea aria-label={`Notes for lesson ${n}`} value={text} onChange={(e) => { setText(e.target.value); setStatus('Unsaved'); }} onBlur={() => { actions.saveNote(n, text); setStatus('Saved on this device'); }} rows={4} placeholder="Write your own summary, questions or reminders… (saved locally when you leave the field)" className="w-full rounded-xl border border-[var(--line)] bg-transparent p-3 text-sm" />
  </Card>;
}
