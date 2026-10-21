import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Editor, type EditorHandle } from './Editor';
import { PreviewSurface, describeProps } from './Preview';
import { Interpreter, formatError } from '../engine/runtime';
import { installFlutter, resolveRoot, walk, type RNode } from '../engine/flutter';
import { runIsolated, cancelRun } from '../engine/sandbox';
import { INSPECTABLE, propStatus, applyProp, currentValue, sourceOf, COLOR_CHOICES, ALIGN_CHOICES, MAIN_CHOICES, CROSS_CHOICES, WEIGHT_CHOICES, type PropSpec } from '../engine/sourceEdit';
import { argb } from '../engine/flutter';
import { NObj } from '../engine/values';
import { useStore, actions } from '../domain/store';
import { Btn, CodeBlock } from './kit';
import { workspaceLayout, previewScale, useViewport } from './layout';

export interface RunState { status: 'idle' | 'running' | 'ok' | 'error'; output: string[]; error: { message: string; line: number; col: number; kind: string } | null; tree: RNode | null; ms: number; isolated: boolean; steps: number }
const EMPTY: RunState = { status: 'idle', output: [], error: null, tree: null, ms: 0, isolated: false, steps: 0 };

export function useRunner(width: number, height: number, timeoutMs: number) {
  const interp = useRef<Interpreter | null>(null);
  const [st, setSt] = useState<RunState>(EMPTY);
  const lastCode = useRef<string>('');
  const rerender = useCallback((extraErr?: any) => {
    const I = interp.current; if (!I) return;
    try {
      const tree = I.rootWidget ? resolveRoot(I, { width, height }) : null;
      setSt((s) => ({ ...s, tree, output: [...I.output], error: extraErr ? formatError(extraErr, I) : null, status: extraErr ? 'error' : 'ok' }));
    } catch (e) { setSt((s) => ({ ...s, output: [...I.output], error: formatError(e, I), status: 'error' })); }
  }, [width, height]);
  /** Main-thread run (needed for an interactive widget tree). Bounded by step/time limits. */
  const runMain = useCallback((code: string, t0 = performance.now(), isolated = false) => {
    lastCode.current = code;
    let I: Interpreter | undefined;
    try {
      I = new Interpreter(code);
      I.hooks.installFlutter = installFlutter;
      I.load(); I.runMain();
      interp.current = I;
      const tree = I.rootWidget ? resolveRoot(I, { width, height }) : null;
      setSt({ status: 'ok', output: [...I.output], error: null, tree, ms: Math.round(performance.now() - t0), isolated, steps: I.steps });
    } catch (e) {
      interp.current = I?.rootWidget ? I : null;
      setSt({ status: 'error', output: I ? [...I.output] : [], error: formatError(e, I), tree: null, ms: Math.round(performance.now() - t0), isolated, steps: I?.steps ?? 0 });
    }
  }, [width, height]);
  /** Full run: isolated, cancellable worker first; then the main thread only if the program builds a widget tree. */
  const run = useCallback(async (code: string) => {
    const t0 = performance.now();
    lastCode.current = code;
    setSt((s) => ({ ...s, status: 'running', error: null }));
    const r = await runIsolated(code, { maxMs: timeoutMs, maxSteps: 50_000_000 });
    if (r.ok && r.hasRoot) { runMain(code, t0, r.isolated); return; }
    interp.current = null;
    setSt({ status: r.ok ? 'ok' : 'error', output: r.output, error: r.error, tree: null, ms: Math.round(performance.now() - t0), isolated: r.isolated, steps: 0 });
  }, [timeoutMs, runMain]);
  const fire = useCallback((fn: any, args: any[]) => {
    const I = interp.current; if (!I) return;
    try { if (fn) { I.resetBudget(); I.callValue(fn, args); } rerender(); }
    catch (e) { rerender(e); }
  }, [rerender]);
  useEffect(() => { if (interp.current?.rootWidget) rerender(); }, [width, height, rerender]);
  return { st, run, runMain, fire, interp, lastCode };
}

export const DEVICES: Record<string, [number, number]> = { 'Compact phone': [320, 568], Phone: [360, 640], 'Large phone': [412, 860], 'Phone landscape': [740, 360], 'Small tablet': [600, 860] };
const KIND_LABEL: Record<string, string> = { syntax: 'Syntax error', compile: 'Static/type error', runtime: 'Runtime error', exception: 'Unhandled exception', limit: 'Execution limit', unsupported: 'Unsupported by offline engine', internal: 'Engine error' };

function InspectorPanel({ sel, tree, code, lastRun, onEdit, onReveal, log }: { sel: RNode; tree: RNode | null; code: string; lastRun: string; onEdit: (spec: PropSpec, v: any) => void; onReveal: (line: number) => void; log: string[] }) {
  const obj = sel.src instanceof NObj ? sel.src : null;
  const call = obj?.src ?? null;
  const specs = INSPECTABLE[sel.type] ?? [];
  const stale = code !== lastRun;
  const shared = useMemo(() => { let n = 0; walk(tree, (x) => { if (x.src instanceof NObj && x.src.src && x.src.src === call) n++; }); return n; }, [tree, call]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => setDraft({}), [sel.id]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2"><div className="font-semibold">{sel.type}{sel.ctor ? '.' + sel.ctor : ''}</div>{sel.userClass && <span className="text-[var(--muted)]">built by {sel.userClass}</span>}
        {call && <button className="ml-auto underline" onClick={() => onReveal(call.line)}>Line {call.line} ↗</button>}</div>
      {stale && <div className="rounded-lg bg-amber-500/15 p-2">Code changed since the last run. Run again to re-sync the inspector with the source.</div>}
      {shared > 1 && <div className="rounded-lg bg-sky-500/15 p-2">This constructor call produces {shared} widgets (loop/builder). Edits change the shared source and affect all of them.</div>}
      {!call && <div className="rounded-lg bg-[var(--chip)] p-2">No direct source call found (created indirectly). Properties are read-only.</div>}
      {specs.length > 0 && call ? (
        <div className="grid gap-2">
          {specs.map((spec) => {
            const status = propStatus(call, spec);
            const cur = currentValue(sel.props, spec, sel.type);
            const disabled = !status.editable || stale;
            const id = `insp-${spec.key}-${spec.path ?? ''}`;
            const num = (min: number, max: number, step = 1) => <div className="flex items-center gap-2"><input id={id} type="range" min={min} max={max} step={step} disabled={disabled} value={cur ?? min} onChange={(e) => onEdit(spec, Number(e.target.value))} className="flex-1 accent-[var(--accent)]" /><input aria-label={spec.label + ' value'} type="number" min={min} max={max} step={step} disabled={disabled} value={cur ?? ''} placeholder="unset" onChange={(e) => e.target.value !== '' && onEdit(spec, Number(e.target.value))} className="w-16 rounded border border-[var(--line)] bg-transparent px-1 py-0.5 tabular-nums" /></div>;
            const choice = (opts: string[]) => <select id={id} disabled={disabled} value={cur ?? ''} onChange={(e) => onEdit(spec, e.target.value)} className="w-full rounded border border-[var(--line)] bg-[var(--card)] px-1 py-1"><option value="" disabled>unset</option>{opts.map((o) => <option key={o}>{o}</option>)}{cur && !opts.includes(cur) && <option>{cur}</option>}</select>;
            return <div key={id} className={`rounded-lg border border-[var(--line)] p-2 ${disabled && !stale ? 'opacity-70' : ''}`}>
              <label htmlFor={id} className="flex items-center gap-2 mb-1"><span className="font-medium">{spec.label}</span>{!status.present && status.editable && <span className="text-[var(--muted)]">(not set — editing inserts it)</span>}</label>
              {spec.kind === 'number' ? num(spec.min ?? 0, spec.max ?? 400, spec.step) : spec.kind === 'edgeAll' || spec.kind === 'radius' || spec.kind === 'borderWidth' ? num(spec.min ?? 0, spec.max ?? 64)
                : spec.kind === 'color' ? <div className="flex items-center gap-2"><span className="h-5 w-5 shrink-0 rounded border border-[var(--line)]" style={{ background: argb(spec.path ? sel.props[spec.path]?.props?.[spec.key] : sel.props.decoration?.props?.color ?? sel.props[spec.key]) ?? 'transparent' }} />{choice(COLOR_CHOICES)}</div>
                : spec.kind === 'alignment' ? choice(ALIGN_CHOICES) : spec.kind === 'mainAxis' ? choice(MAIN_CHOICES) : spec.kind === 'crossAxis' ? choice(CROSS_CHOICES) : spec.kind === 'fontWeight' ? choice(WEIGHT_CHOICES)
                : <input id={id} disabled={disabled} value={draft[id] ?? cur ?? ''} onChange={(e) => setDraft({ ...draft, [id]: e.target.value })} onBlur={() => draft[id] !== undefined && draft[id] !== cur && onEdit(spec, draft[id])} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="w-full rounded border border-[var(--line)] bg-transparent px-2 py-1" />}
              {!status.editable && status.reason && <div className="mt-1 text-amber-700 dark:text-amber-400">↔ {status.reason}</div>}
            </div>;
          })}
        </div>
      ) : specs.length === 0 && <div className="text-[var(--muted)]">Two-way editing is not available for {sel.type}. Its properties are shown read-only below.</div>}
      {call && <details><summary className="cursor-pointer text-[var(--muted)]">Source of this widget</summary><CodeBlock code={sourceOf(lastRun, call).text} className="mt-1 text-[11px] max-h-48" /></details>}
      <details><summary className="cursor-pointer text-[var(--muted)]">All runtime properties (read-only)</summary>
        <table className="w-full mt-1"><tbody>{describeProps(sel).map(([k, v]) => <tr key={k} className="border-t border-[var(--line)]"><td className="py-0.5 pr-2 text-[var(--muted)] align-top">{k}</td><td className="font-mono break-all">{v}</td></tr>)}</tbody></table></details>
      {log.length > 0 && <div><div className="text-[var(--muted)]">Source changes made by the inspector (undo with ↶):</div><ul className="font-mono">{log.slice(-5).map((l, i) => <li key={i}>✎ {l}</li>)}</ul></div>}
    </div>
  );
}

export function Workspace({ code, setCode, onRunExtra, toolbar, height = 420, showInspector = true, autoRun = false }: { code: string; setCode: (s: string) => void; onRunExtra?: () => void; toolbar?: ReactNode; height?: number; showInspector?: boolean; autoRun?: boolean }) {
  const settings = useStore((s) => s.settings);
  const vp = useViewport();
  const [size, setSize] = useState<[number, number]>([settings.previewWidth, settings.previewHeight]);
  const { st, run, runMain, fire, interp, lastCode } = useRunner(size[0], size[1], settings.runTimeout);
  const ed = useRef<EditorHandle>(null);
  const [inspect, setInspect] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [editErr, setEditErr] = useState('');
  const [tab, setTab] = useState<'preview' | 'output'>('preview');
  useEffect(() => { if (autoRun) run(code); /* eslint-disable-next-line */ }, []);
  const doRun = () => { run(code); onRunExtra?.(); };
  useEffect(() => { if (st.status === 'ok' && !st.tree) setTab('output'); if (st.tree) setTab('preview'); }, [st.status, st.tree]);
  const sel = useMemo(() => { let f: RNode | null = null; if (selId) walk(st.tree, (n) => { if (!f && n.id === selId) f = n; }); return f as RNode | null; }, [st.tree, selId]);
  const split = workspaceLayout(vp.w) === 'split';
  const panelW = split ? 372 : Math.min(vp.w - 32, 520);
  const scale = previewScale(Math.min(panelW, 372 + 28), size[0]);
  const onEdit = (spec: PropSpec, v: any) => {
    const obj = sel?.src instanceof NObj ? sel.src : null;
    if (!obj?.src) return;
    const r = applyProp(lastCode.current, obj.src, spec, v);
    if (!r.ok) { setEditErr(r.reason); return; }
    setEditErr(''); setCode(r.code); runMain(r.code); setLog((l) => [...l, r.summary]);
  };
  const running = st.status === 'running';
  return (
    <div className={split ? 'grid gap-4 grid-cols-[minmax(0,1fr)_372px]' : 'grid gap-4'}>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {running ? <Btn kind="danger" onClick={() => cancelRun()} title="Stop execution">■ Stop</Btn> : <Btn kind="primary" onClick={doRun} title="Run (Ctrl+Enter)">▶ Run</Btn>}
          <Btn onClick={() => ed.current?.undo()} title="Undo (Ctrl+Z)" aria-label="Undo">↶ Undo</Btn>
          <Btn onClick={() => ed.current?.redo()} title="Redo (Ctrl+Y)" aria-label="Redo">↷ Redo</Btn>
          <Btn onClick={() => ed.current?.format()} title="Re-indent code">⇥ Format</Btn>
          {toolbar}
          <span className="ml-auto text-xs text-[var(--muted)] flex items-center gap-1.5" aria-live="polite">
            {running ? <><span className="h-3 w-3 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />Running in isolated worker…</>
              : st.status === 'idle' ? 'Not run yet' : st.status === 'ok' ? <span className="text-emerald-600 dark:text-emerald-400">✓ Ran in {st.ms} ms{st.isolated ? ' · isolated' : ''}{st.steps ? ` · ${st.steps.toLocaleString()} steps` : ''}</span> : <span className="text-red-600 dark:text-red-400">✕ {KIND_LABEL[st.error?.kind ?? ''] ?? 'Error'}</span>}
          </span>
        </div>
        <div onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doRun(); } }}>
          <Editor ref={ed} value={code} onChange={setCode} fontSize={settings.editorFont} lineNumbers={settings.lineNumbers} errorLine={code === lastCode.current ? st.error?.line || null : null} minHeight={height} />
        </div>
        {st.error && (
          <div role="alert" className={`rounded-xl border p-3 text-sm anim-fade ${st.error.kind === 'unsupported' ? 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-200'}`}>
            <div className="flex flex-wrap items-center gap-2 mb-1 font-semibold">{KIND_LABEL[st.error.kind] ?? 'Error'}{st.error.line ? <button className="underline font-normal" onClick={() => ed.current?.focusLine(st.error!.line)}>Go to line {st.error.line}:{st.error.col}</button> : null}</div>
            <div className="font-mono whitespace-pre-wrap">{st.error.message}</div>
            {st.error.kind === 'unsupported' && <div className="mt-1 text-xs opacity-80">This is a limitation of the offline engine, not necessarily an error in your Dart. See Code Lab → Supported subset.</div>}
            {st.error.kind === 'limit' && <div className="mt-1 text-xs opacity-80">The sandbox stopped your program to protect the app. Check loop conditions and recursion base cases, or raise the run time limit in Settings (max 10 s).</div>}
          </div>
        )}
      </div>
      <div className="w-full space-y-2 min-w-0">
        <div className="flex items-center gap-1 rounded-xl bg-[var(--chip)] p-1 text-sm" role="tablist">
          {(['preview', 'output'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded-lg px-3 py-1.5 capitalize transition ${tab === t ? 'bg-[var(--card)] shadow font-semibold' : ''}`}>{t}{t === 'output' && st.output.length ? ` (${st.output.length})` : ''}</button>)}
        </div>
        {tab === 'preview' ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select aria-label="Preview device" className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-2 py-1" value={Object.entries(DEVICES).find(([, v]) => v[0] === size[0] && v[1] === size[1])?.[0] ?? 'custom'} onChange={(e) => { const d = DEVICES[e.target.value]; if (d) setSize(d); }}>
                {Object.keys(DEVICES).map((k) => <option key={k}>{k}</option>)}<option value="custom" disabled>Custom</option>
              </select>
              <label className="flex items-center gap-1">W<input aria-label="Preview width" type="range" min={280} max={760} value={size[0]} onChange={(e) => setSize([Number(e.target.value), size[1]])} className="w-20" /></label>
              <span className="tabular-nums text-[var(--muted)]">{size[0]}×{size[1]}</span>
              {showInspector && <button onClick={() => { setInspect(!inspect); setSelId(null); }} aria-pressed={inspect} className={`ml-auto rounded-lg px-2 py-1 border transition ${inspect ? 'border-amber-500 bg-amber-500/15' : 'border-[var(--line)]'}`}>🔍 Inspect & edit</button>}
            </div>
            <div className="mx-auto rounded-[26px] border-[6px] border-neutral-800 bg-neutral-800 shadow-lg overflow-hidden" style={{ width: size[0] * scale + 12, height: size[1] * scale + 12 }}>
              <div style={{ width: size[0], height: size[1], transform: `scale(${scale})`, transformOrigin: 'top left' }} className="bg-white text-black overflow-hidden">
                {st.tree && interp.current ? <PreviewSurface tree={st.tree} api={{ interp: interp.current, fire, inspect, selected: selId, select: (n) => setSelId(n.id), reducedMotion: settings.reducedMotion }} />
                  : <div className="h-full grid place-items-center p-6 text-center text-sm text-neutral-500">{running ? 'Running…' : st.status === 'idle' ? 'Press ▶ Run to render the widget preview.' : st.output.length && !st.error ? 'This program printed output but did not call runApp(). See the Output tab.' : st.error ? 'Fix the error to see the preview.' : 'No widget to show.'}</div>}
              </div>
            </div>
            <p className="text-[11px] text-center text-[var(--muted)]">Controlled preview renderer (not the native Flutter engine). Layout approximates Flutter's constraints.</p>
            {inspect && (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-3 text-xs anim-fade">
                {editErr && <div className="mb-2 rounded bg-red-500/15 p-2">{editErr}</div>}
                {sel ? <InspectorPanel sel={sel} tree={st.tree} code={code} lastRun={lastCode.current} onEdit={onEdit} onReveal={(l) => ed.current?.focusLine(l)} log={log} />
                  : 'Tap a widget in the preview to select it. Supported widgets (Container, Text, Icon, Row, Column, Padding, SizedBox, Card…) can be edited here, and changes are written back into your code.'}
              </div>
            )}
          </div>
        ) : (
          <pre className="min-h-[240px] max-h-[520px] overflow-auto rounded-xl bg-[var(--code-bg)] text-[var(--code-fg)] p-3 text-sm font-mono whitespace-pre-wrap" aria-live="polite">{st.output.length ? st.output.join('\n') : st.status === 'idle' ? '// Output appears here after you run.' : '// (no output)'}</pre>
        )}
      </div>
    </div>
  );
}

export function useDraft(key: string, initial: string): [string, (s: string) => void, () => void] {
  const saved = useStore((s) => s.drafts[key]);
  const [code, setCode] = useState(saved ?? initial);
  const t = useRef<any>(null);
  const set = (s: string) => { setCode(s); clearTimeout(t.current); t.current = setTimeout(() => actions.saveDraft(key, s), 400); };
  const reset = () => { setCode(initial); actions.saveDraft(key, initial); };
  return [code, set, reset];
}
