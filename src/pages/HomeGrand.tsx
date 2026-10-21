import { useMemo, useState } from 'react';
import { grandExam, gradeExam, lesson, LESSONS, GRAND_PASS, GRAND_PRACTICAL_MIN, type ReviewItem } from '../data/curriculum';
import { useStore, actions, streak } from '../domain/store';
import { project, grandLockReason, nextAction, scoreGrand } from '../domain/progression';
import { Btn, Card, Badge, Bar, Ring, Stat, Empty } from '../ui/kit';
import { ExamRunner, PracticalRunner } from '../ui/Assess';
import { go } from '../ui/router';
import type { GradeResult } from '../engine/harness';

export function GrandTestPage({ k }: { k: number }) {
  const hist = useStore((s) => s);
  const p = project(hist);
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const exam = useMemo(() => grandExam(k, seed), [k, seed]);
  const [stage, setStage] = useState<'intro' | 'mcq' | 'c1' | 'c2' | 'practical' | 'done'>('intro');
  const [mcq, setMcq] = useState<{ score: number; review: ReviewItem[] } | null>(null);
  const [c, setC] = useState<(GradeResult | null)[]>([null, null, null]);
  const attempts = hist.grand.filter((g) => g.k === k);
  const reason = grandLockReason(p, k);
  if (!(k >= 1 && k <= 24)) return <p>Unknown grand test.</p>;
  const marks = scoreGrand(mcq?.score ?? 0, c[0]?.score ?? 0, c[1]?.score ?? 0, c[2]?.score ?? 0);
  const total = marks.total;
  const finish = () => { actions.recordGrand({ k, mcq: marks.mcq, coding: marks.coding, practical: marks.pr, total }); setStage('done'); };
  const restart = () => { setSeed(seed + 1); setStage('intro'); setMcq(null); setC([null, null, null]); };
  const steps = ['mcq', 'c1', 'c2', 'practical'];
  return (
    <div className="space-y-4">
      <div className="gradient-hero rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5 space-y-2">
        <div className="text-xs"><button className="underline" onClick={() => go('/learn')}>Learn</button> › Grand Test {k}</div>
        <h1 className="text-2xl font-bold">🏆 Grand Test {k} <span className="text-base font-medium text-[var(--muted)]">· Lessons {exam.spec.lessons[0]}–{exam.spec.lessons[4]}</span></h1>
        <div className="flex flex-wrap gap-2 text-sm"><Badge>20 MCQ × 1</Badge><Badge>2 coding × 5</Badge><Badge>Practical × 20</Badge><Badge tone="info">Pass: ≥ {GRAND_PASS}/50 and practical ≥ {GRAND_PRACTICAL_MIN}/20</Badge>{p.grandPassed[k] && <Badge tone="good">✅ Passed</Badge>}</div>
        {stage !== 'intro' && stage !== 'done' && <div className="flex gap-1 pt-2">{steps.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${steps.indexOf(stage) >= i ? 'bg-[var(--accent)]' : 'bg-[var(--chip)]'}`} />)}</div>}
      </div>
      {reason ? <Card>🔒 {reason}</Card> : stage === 'intro' ? (
        <Card className="space-y-3">
          <p className="text-sm">This cumulative test covers lessons {exam.spec.lessons.join(', ')}{k > 1 ? ' with questions from earlier lessons' : ''}. Complete all four parts in one sitting; your attempt is recorded when you finish.</p>
          <ul className="text-sm list-disc pl-5"><li>Part A — 20 multiple-choice questions (20 marks)</li><li>Part B — {exam.spec.coding.map((t) => `"${t.title}"`).join(' and ')} (5 marks each)</li><li>Part C — practical: "{exam.spec.practical.title}" (20 marks, minimum 12)</li></ul>
          {attempts.length > 0 && <p className="text-sm text-[var(--muted)]">Previous attempts: {attempts.map((a) => `${a.total}/50 (practical ${a.practical}/20)`).join(' · ')}</p>}
          <Btn kind="primary" onClick={() => setStage('mcq')}>Start Grand Test</Btn>
        </Card>
      ) : stage === 'mcq' ? (
        <ExamRunner key={seed} title="Part A · 20 MCQs" questions={exam.questions} onSubmit={(a) => { const g = gradeExam(exam.sessionId, a); setMcq({ score: g.score, review: g.review }); setStage('c1'); }} />
      ) : stage === 'c1' || stage === 'c2' || stage === 'practical' ? (
        <div className="space-y-3">
          {(() => { const i = stage === 'c1' ? 0 : stage === 'c2' ? 1 : 2; const task = i < 2 ? exam.spec.coding[i] : exam.spec.practical; return <>
            <PracticalRunner key={stage + seed} task={task} draftKey={`grand-${k}-${stage}`} marks={i < 2 ? '5 marks' : '20 marks'} gradeLabel="Grade this part" onGraded={(r) => { const nc = [...c]; nc[i] = r; setC(nc); }} />
            <Card className="flex items-center gap-3"><div className="text-sm flex-1">{c[i] ? <>Current score for this part: <b>{i < 2 ? Math.round((c[i]!.score / 100) * 5) + '/5' : Math.round((c[i]!.score / 100) * 20) + '/20'}</b>. You may re-grade before continuing.</> : 'Grade this part before continuing (ungraded parts score 0).'}</div>
              <Btn kind="primary" onClick={() => { if (!c[i] && !confirm('This part has not been graded and will score 0. Continue?')) return; if (i === 0) setStage('c2'); else if (i === 1) setStage('practical'); else finish(); }}>{i < 2 ? 'Next part →' : 'Finish & record attempt'}</Btn></Card>
          </>; })()}
        </div>
      ) : (
        <Card className={`space-y-3 border-2 anim-up ${marks.passed ? 'border-emerald-500/60' : 'border-red-500/60'}`}>
          <div className="flex items-center gap-3"><span className="text-3xl anim-pop" aria-hidden>{marks.passed ? '🏆' : '📚'}</span><div className="text-3xl font-bold tabular-nums">{total}/50</div></div>
          <table className="text-sm w-full max-w-sm"><tbody>
            <tr><td>Part A — MCQ</td><td className="text-right tabular-nums">{marks.mcq}/20</td></tr>
            <tr><td>Part B — Coding 1</td><td className="text-right tabular-nums">{marks.c1}/5</td></tr>
            <tr><td>Part B — Coding 2</td><td className="text-right tabular-nums">{marks.c2}/5</td></tr>
            <tr><td>Part C — Practical</td><td className={`text-right tabular-nums ${marks.pr < GRAND_PRACTICAL_MIN ? 'text-red-500 font-bold' : ''}`}>{marks.pr}/20</td></tr>
          </tbody></table>
          {total >= GRAND_PASS && marks.pr >= GRAND_PRACTICAL_MIN ? <p className="text-emerald-600 dark:text-emerald-400 font-semibold">Passed! Lessons {5 * k + 1}–{5 * k + 5} are unlocked.</p>
            : <p className="text-red-600 dark:text-red-400 font-semibold">Not passed. {total < GRAND_PASS ? `Total below ${GRAND_PASS}. ` : ''}{marks.pr < GRAND_PRACTICAL_MIN ? `Practical below ${GRAND_PRACTICAL_MIN}/20. ` : ''}The next block stays locked — review and retry.</p>}
          {mcq && mcq.review.some((r) => !r.correct) && <div className="text-sm"><b>Revise:</b> {[...new Set(mcq.review.filter((r) => !r.correct).map((r) => r.lesson))].map((n) => <button key={n} className="underline mr-2" onClick={() => go(`/lesson/${n}`)}>L{n} {lesson(n).title}</button>)}</div>}
          <div className="flex gap-2"><Btn onClick={restart}>↻ Retake</Btn>{total >= GRAND_PASS && marks.pr >= GRAND_PRACTICAL_MIN && k < 24 && <Btn kind="primary" onClick={() => go(`/lesson/${5 * k + 1}`)}>Continue →</Btn>}</div>
        </Card>
      )}
    </div>
  );
}

export function HomePage() {
  const s = useStore((x) => x);
  const p = project(s);
  const next = nextAction(p);
  const cur = lesson(Math.min(next.kind === 'lesson' ? next.n : p.current, 120));
  const recent = [...s.mcq].sort((a, b) => b.at - a.at).slice(0, 4);
  const failedLessons = [...new Set(s.mcq.filter((a) => !a.passed && !p.mcqPassed[a.lesson]).map((a) => a.lesson))].slice(0, 3);
  const weak = [...new Set(s.mcq.slice(-5).flatMap((a) => a.reviewLessons))].filter((n) => n && !failedLessons.includes(n)).slice(0, 3);
  const level = p.completedCount >= 70 ? 'Advanced' : p.completedCount >= 30 ? 'Intermediate' : 'Beginner';
  const upcomingK = Math.min(24, Math.floor(p.completedCount / 5) + (p.grandPassed[Math.floor(p.completedCount / 5)] || p.completedCount % 5 !== 0 ? 1 : 0)) || 1;
  const tracks: [string, number, number][] = [['Beginner', 1, 30], ['Intermediate', 31, 70], ['Advanced', 71, 120]];
  return (
    <div className="space-y-5">
      <section className="gradient-hero rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5 sm:p-7 anim-up">
        <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
          <div className="flex-1 space-y-2">
            <Badge tone="info">Level: {level}</Badge>
            <h1 className="text-2xl sm:text-3xl font-bold">{s.mcq.length === 0 && s.practical.length === 0 ? 'Welcome to Flutter Learning Academy' : 'Welcome back'}</h1>
            <p className="text-sm text-[var(--muted)]">{next.kind === 'grand' ? `Next up: Grand Test ${next.n}` : next.kind === 'done' ? 'You completed the whole curriculum! 🎓' : `Current lesson ${cur.n}: ${cur.title}`}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Btn kind="primary" onClick={() => go(next.kind === 'grand' ? `/grand/${next.n}` : `/lesson/${next.kind === 'done' ? 120 : next.n}`)}>{s.mcq.length || s.practical.length ? '▶ Resume learning' : '▶ Start lesson 1'}</Btn>
              <Btn onClick={() => go('/lab')}>⌨ Code Lab</Btn><Btn onClick={() => go('/practice')}>🎯 Practice</Btn>
            </div>
          </div>
          <Ring value={(p.completedCount / 120) * 100} label="Overall" size={112} />
        </div>
      </section>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Lessons completed" value={`${p.completedCount}/120`} />
        <Stat label="Current streak" value={`${streak(s.activity)} 🔥`} sub="days with activity" />
        <Stat label="Grand tests passed" value={`${p.grandPassed.filter(Boolean).length}/24`} />
        <Stat label="Exam attempts" value={s.mcq.length} sub={s.mcq.length ? `${s.mcq.filter((a) => a.passed).length} passed` : 'none yet'} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-semibold">📈 Recent exam results</h2>
          {recent.length ? <ul className="space-y-2">{recent.map((a) => <li key={a.id} className="flex items-center gap-2 text-sm"><Badge tone={a.passed ? 'good' : 'bad'}>{a.score}/20</Badge><button className="truncate hover:underline" onClick={() => go(`/lesson/${a.lesson}`)}>L{a.lesson} · {lesson(a.lesson).title}</button><span className="ml-auto text-xs text-[var(--muted)]">{new Date(a.at).toLocaleDateString()}</span></li>)}</ul>
            : <Empty icon="📝" title="No exams yet" body="Results appear here after your first lesson exam." />}
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">🏆 Upcoming grand test</h2>
          <div className="text-sm">Grand Test {upcomingK} · lessons {5 * upcomingK - 4}–{5 * upcomingK}</div>
          <Bar value={[0, 1, 2, 3, 4].filter((d) => p.complete[5 * upcomingK - d]).length} max={5} label="Block progress" />
          <div className="text-xs text-[var(--muted)]">{p.grandAvailable[upcomingK] ? 'Available now.' : grandLockReason(p, upcomingK)}</div>
          {p.grandAvailable[upcomingK] && !p.grandPassed[upcomingK] && <Btn kind="primary" onClick={() => go(`/grand/${upcomingK}`)}>Take Grand Test {upcomingK}</Btn>}
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">🔁 Recommended revision</h2>
          {failedLessons.length || weak.length ? <ul className="space-y-1 text-sm">
            {failedLessons.map((n) => <li key={n}>❗ <button className="underline" onClick={() => go(`/lesson/${n}`)}>Lesson {n}: {lesson(n).title}</button> — exam not passed yet</li>)}
            {weak.map((n) => <li key={n}>↺ <button className="underline" onClick={() => go(`/lesson/${n}`)}>Lesson {n}: {lesson(n).title}</button> — missed questions recently</li>)}
          </ul> : <p className="text-sm text-[var(--muted)]">Nothing to revise yet — recommendations are based on your failed or missed questions.</p>}
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">🧭 Tracks</h2>
          {tracks.map(([name, a, b]) => { const done = LESSONS.filter((l) => l.n >= a && l.n <= b && p.complete[l.n]).length; return <button key={name} onClick={() => go('/learn')} className="block w-full text-left space-y-1"><div className="flex text-sm"><span className="font-medium">{name}</span><span className="ml-auto text-[var(--muted)] tabular-nums">{done}/{b - a + 1} · L{a}–{b}</span></div><Bar value={done} max={b - a + 1} label={name} /></button>; })}
        </Card>
      </div>
    </div>
  );
}
