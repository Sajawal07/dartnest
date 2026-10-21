import { useMemo, useState } from 'react';
import type { PublicQuestion, ReviewItem } from '../data/curriculum';
import { lesson } from '../data/curriculum';
import { grade, type GradeResult, type TaskDef } from '../engine/harness';
import { Btn, Card, Badge, CodeBlock, Bar } from './kit';
import { Workspace, useDraft } from './Workspace';
import { go } from './router';

const TYPE_LABEL: Record<string, string> = { concept: 'Concept', syntax: 'Syntax', output: 'Output prediction', bug: 'Bug identification', decision: 'Appropriate use', interpretation: 'Code interpretation', review: 'Cumulative review' };

export function ExamRunner({ questions, onSubmit, title }: { questions: PublicQuestion[]; onSubmit: (answers: Record<string, number>) => void; title: string }) {
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<Record<string, number>>({});
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const q = questions[i];
  const answered = Object.keys(ans).length;

  // Guard: empty questions
  if (!questions.length || !q) return (
    <Card className="space-y-4">
      <h2 className="font-bold">{title}</h2>
      <p className="text-sm text-[var(--muted)]">No questions available for this exam. Please try again.</p>
    </Card>
  );

  const handleSubmit = () => {
    if (answered < questions.length) {
      setShowSubmitConfirm(true); // show inline confirm instead of window.confirm()
    } else {
      onSubmit(ans);
    }
  };

  return (
    <Card className="space-y-4 anim-up">
      {/* Inline submit confirmation modal — replaces window.confirm() which is blocked in Android WebView */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <Card className="max-w-sm w-full space-y-3">
            <h2 className="font-bold text-lg">Submit exam?</h2>
            <p className="text-sm text-[var(--muted)]">{questions.length - answered} question(s) unanswered — they will score 0. Submit anyway?</p>
            <div className="flex gap-2 justify-end">
              <Btn kind="ghost" onClick={() => setShowSubmitConfirm(false)}>Go back</Btn>
              <Btn kind="primary" onClick={() => { setShowSubmitConfirm(false); onSubmit(ans); }}>Submit anyway</Btn>
            </div>
          </Card>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold">{title}</h2>
        <Badge>{TYPE_LABEL[q.type]}</Badge>
        <span className="ml-auto text-sm text-[var(--muted)]">{answered}/{questions.length} answered</span>
      </div>
      <Bar value={answered} max={questions.length} label="Answered" />
      <div className="flex flex-wrap gap-1" aria-label="Question navigator">
        {questions.map((x, k) => <button key={x.qid} onClick={() => setI(k)} aria-label={`Question ${k + 1}${ans[x.qid] !== undefined ? ' (answered)' : ''}`} aria-current={k === i} className={`h-8 w-8 rounded-lg text-xs font-semibold ${k === i ? 'ring-2 ring-[var(--accent)]' : ''} ${ans[x.qid] !== undefined ? 'bg-[var(--accent)] text-white' : 'bg-[var(--chip)]'}`}>{k + 1}</button>)}
      </div>
      <fieldset className="space-y-3">
        <legend className="font-semibold whitespace-pre-wrap">Q{i + 1}. {q.prompt}</legend>
        {q.code && <CodeBlock code={q.code} />}
        <div className="grid gap-2">
          {q.options.map((o, k) => {
            const on = ans[q.qid] === k;
            return <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${on ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--line)] hover:bg-[var(--chip)]'}`}>
              <input type="radio" name={q.qid} checked={on} onChange={() => setAns({ ...ans, [q.qid]: k })} className="mt-1 accent-[var(--accent)]" />
              {q.optionsAreCode ? <pre className="text-[13px] font-mono whitespace-pre-wrap break-words flex-1 min-w-0">{o}</pre> : <span className="text-sm">{o}</span>}
            </label>;
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Btn kind="outline" disabled={i === 0} onClick={() => setI(i - 1)}>← Previous</Btn>
        <Btn kind="outline" disabled={i === questions.length - 1} onClick={() => setI(i + 1)}>Next →</Btn>
        <Btn kind="primary" className="ml-auto" onClick={handleSubmit}>Submit exam</Btn>
      </div>
      <p className="text-xs text-[var(--muted)]">Answers are revealed only after submission. Each question is worth 1 mark.</p>
    </Card>
  );
}

export function ExamReview({ questions, review, score, total, passMark, onRetry, extra }: { questions: PublicQuestion[]; review: ReviewItem[]; score: number; total: number; passMark: number; onRetry: () => void; extra?: React.ReactNode }) {
  const passed = score >= passMark;
  const wrong = review.filter((r) => !r.correct);
  const sections = useMemo(() => { const m = new Map<string, number>(); wrong.forEach((w) => m.set(w.section + (w.lesson ? `|${w.lesson}` : ''), (m.get(w.section + (w.lesson ? `|${w.lesson}` : '')) ?? 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [wrong]);
  const [showAll, setShowAll] = useState(false);
  return (
    <div className="space-y-4 anim-up">
      <Card className={`border-2 ${passed ? 'border-emerald-500/60' : 'border-red-500/60'}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-4xl anim-pop" aria-hidden>{passed ? '🎉' : '📚'}</div>
          <div>
            <div className="text-2xl font-bold tabular-nums">{score}/{total} <span className="text-base font-medium text-[var(--muted)]">({Math.round((score / total) * 100)}%)</span></div>
            <div className={passed ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'}>{passed ? 'Passed' : `Not passed — ${passMark}/${total} required`}</div>
          </div>
          <div className="ml-auto flex gap-2">{extra}<Btn onClick={onRetry}>↻ New attempt</Btn></div>
        </div>
      </Card>
      {wrong.length > 0 && (
        <Card className="space-y-2">
          <h3 className="font-semibold">🎯 Targeted revision</h3>
          <ul className="text-sm space-y-1">
            {sections.slice(0, 6).map(([k, c]) => { const [sec, ln] = k.split('|'); return <li key={k} className="flex items-center gap-2"><Badge tone="warn">{c}×</Badge>Re-read <b>{sec}</b>{ln ? <> in <button className="underline" onClick={() => go(`/lesson/${ln}`)}>lesson {ln}: {lesson(Number(ln)).title}</button></> : null}</li>; })}
          </ul>
        </Card>
      )}
      <Card className="space-y-3">
        <div className="flex items-center"><h3 className="font-semibold">Answer review</h3><label className="ml-auto text-sm flex items-center gap-2"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show correct answers too</label></div>
        {questions.map((q, k) => {
          const r = review.find((x) => x.qid === q.qid)!;
          if (!showAll && r.correct) return null;
          return <div key={q.qid} className="rounded-xl border border-[var(--line)] p-3 space-y-2">
            <div className="flex gap-2 items-start"><Badge tone={r.correct ? 'good' : 'bad'}>{r.correct ? '✓' : '✕'} Q{k + 1}</Badge><span className="text-sm font-medium whitespace-pre-wrap">{q.prompt}</span></div>
            {q.code && <CodeBlock code={q.code} className="text-xs" />}
            <div className="text-sm space-y-1">
              {r.chosen !== null && !r.correct && <div className="text-red-600 dark:text-red-400">Your answer: <span className={q.optionsAreCode ? 'font-mono whitespace-pre-wrap' : ''}>{q.options[r.chosen]}</span></div>}
              {r.chosen === null && <div className="text-red-600 dark:text-red-400">Not answered</div>}
              <div className="text-emerald-700 dark:text-emerald-400">Correct: <span className={q.optionsAreCode ? 'font-mono whitespace-pre-wrap' : ''}>{q.options[r.correctIndex]}</span></div>
              <div className="text-[var(--muted)] whitespace-pre-wrap">💡 {r.explanation}</div>
            </div>
          </div>;
        })}
        {!showAll && wrong.length === 0 && <p className="text-sm text-[var(--muted)]">Every answer was correct.</p>}
      </Card>
    </div>
  );
}

export function TaskBrief({ task, marks }: { task: TaskDef; marks?: string }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-bold">{task.title}</h3><Badge tone="info">{task.kind === 'ui' ? 'Widget-building' : 'Dart logic'}</Badge>{marks && <Badge>{marks}</Badge>}</div>
      <p>{task.statement}</p>
      <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
        <div><dt className="text-[var(--muted)] text-xs">Inputs / outputs</dt><dd className="font-mono text-xs">{task.io}</dd></div>
        <div><dt className="text-[var(--muted)] text-xs">Expected behaviour</dt><dd className="text-xs">{task.expected}</dd></div>
        <div><dt className="text-[var(--muted)] text-xs">Constraints</dt><dd className="text-xs">{task.constraints}</dd></div>
        <div><dt className="text-[var(--muted)] text-xs">Allowed APIs</dt><dd className="text-xs">{task.allowed}</dd></div>
      </dl>
      <details className="text-xs"><summary className="cursor-pointer text-[var(--muted)]">Acceptance criteria & rubric ({task.tests.length} automated tests)</summary>
        <ul className="list-disc pl-5 mt-1 space-y-0.5">
          <li>10 pts — code parses in the supported Dart subset</li>
          <li>10 pts — {task.kind === 'logic' ? `declares ${task.fn}` : 'main() calls runApp() and the widget tree builds'}</li>
          {task.tests.map((t, i) => <li key={i}>{(80 / task.tests.length).toFixed(1)} pts — {'expr' in t ? `${t.expr} returns the expected value` : t.name}</li>)}
          <li>Pass mark: 70/100. Partial credit is awarded per passing test.</li>
        </ul>
      </details>
    </div>
  );
}

export function Hints({ task }: { task: TaskDef }) {
  const [n, setN] = useState(0);
  const all = [
    task.hints[0],
    task.kind === 'logic' ? `Structure: declare exactly "${task.io}". Tests call it like ${'expr' in task.tests[0] ? (task.tests[0] as any).expr : ''}.` : `Structure: the tests ${task.tests.map((t) => ('steps' in t ? t.steps.filter((s) => s[0] === 'tap').map((s) => `tap '${s[1]}'`).join(', ') : '')).filter(Boolean).slice(0, 2).join('; ') || 'inspect the rendered widget tree'} — make sure labels match exactly.`,
    `First lines of the reference solution:\n${task.solution.split('\n').filter((l) => l.trim() && !l.startsWith('import')).slice(0, 3).join('\n')}`,
  ];
  return <div className="space-y-2">
    {all.slice(0, n).map((h, i) => <div key={i} className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-sm whitespace-pre-wrap"><b>Hint {i + 1}:</b> {h}</div>)}
    {n < all.length && <Btn kind="ghost" onClick={() => setN(n + 1)}>💡 Show hint {n + 1} of {all.length}</Btn>}
  </div>;
}

export function GradeView({ r }: { r: GradeResult }) {
  return (
    <Card className={`space-y-3 border-2 anim-up ${r.status === 'unsupported' ? 'border-amber-500/60' : r.passed ? 'border-emerald-500/60' : 'border-red-500/60'}`}>
      <div className="flex items-center gap-3">
        <div className="text-2xl font-bold tabular-nums">{r.score}/100</div>
        <span className="anim-pop"><Badge tone={r.status === 'unsupported' ? 'warn' : r.passed ? 'good' : 'bad'}>{r.status === 'unsupported' ? 'Unsupported by offline engine' : r.passed ? '✓ Passed' : 'Not passed'}</Badge></span>
      </div>
      <p className="text-sm">{r.message}</p>
      <ul className="space-y-1 text-sm">
        {r.breakdown.map((b, i) => <li key={i} className="flex gap-2"><span aria-hidden>{b.passed ? '✅' : '❌'}</span><div className="min-w-0"><div className="font-medium">{b.name} <span className="text-[var(--muted)] tabular-nums">({b.points.toFixed(1)}/{b.max.toFixed(1)})</span></div><div className="text-xs text-[var(--muted)] break-words font-mono">{b.detail}</div></div></li>)}
      </ul>
    </Card>
  );
}

export function PracticalRunner({ task, draftKey, onGraded, marks, gradeLabel = 'Submit for grading' }: { task: TaskDef; draftKey: string; onGraded: (r: GradeResult, code: string) => void; marks?: string; gradeLabel?: string }) {
  const [code, setCode, reset] = useDraft(draftKey, task.starter);
  const [res, setRes] = useState<GradeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = () => { setBusy(true); setRes(null); setTimeout(() => { const r = grade(task, code); setRes(r); onGraded(r, code); setBusy(false); }, 20); };
  return (
    <div className="space-y-4">
      <Card><TaskBrief task={task} marks={marks} /></Card>
      <Workspace code={code} setCode={setCode} toolbar={<><Btn kind="ghost" onClick={() => { if (confirm('Reset to the starter code? Your draft will be replaced.')) reset(); }}>⟲ Reset</Btn><Btn kind="primary" onClick={submit} disabled={busy}>{busy ? 'Grading…' : `✓ ${gradeLabel}`}</Btn></>} />
      {busy && <div className="flex items-center gap-2 text-sm text-[var(--muted)]" role="status"><span className="h-4 w-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />Running {task.tests.length} acceptance tests…</div>}
      {res && <GradeView r={res} />}
      <Hints task={task} />
    </div>
  );
}
