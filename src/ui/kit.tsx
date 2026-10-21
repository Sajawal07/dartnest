import { useEffect, useState, type ReactNode } from 'react';
import { highlight } from './Editor';

export function Btn({ kind = 'tonal', children, className = '', ...rest }: { kind?: 'primary' | 'tonal' | 'ghost' | 'danger' | 'outline'; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const k = {
    primary: 'bg-[var(--accent)] text-white hover:brightness-110 shadow-sm',
    tonal: 'bg-[var(--chip)] hover:bg-[var(--chip-hover)]',
    ghost: 'hover:bg-[var(--chip)]',
    outline: 'border border-[var(--line)] hover:bg-[var(--chip)]',
    danger: 'bg-red-600 text-white hover:bg-red-500',
  }[kind];
  return <button {...rest} className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none ${k} ${className}`}>{children}</button>;
}
export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,.04)] ${className}`}>{children}</div>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'info' }) {
  const t = { neutral: 'bg-[var(--chip)] text-[var(--fg)]', good: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', bad: 'bg-red-500/15 text-red-700 dark:text-red-300', warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', info: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}
export function Bar({ value, max = 100, tone = 'accent', label }: { value: number; max?: number; tone?: 'accent' | 'good' | 'bad'; label?: string }) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const c = { accent: 'bg-[var(--accent)]', good: 'bg-emerald-500', bad: 'bg-red-500' }[tone];
  return <div role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full rounded-full bg-[var(--chip)] overflow-hidden"><div className={`h-full ${c} rounded-full transition-[width] duration-700`} style={{ width: `${pct}%` }} /></div>;
}
export function Ring({ value, size = 96, stroke = 10, label }: { value: number; size?: number; stroke?: number; label: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(value)}%`}>
    <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} stroke="var(--chip)" strokeWidth={stroke} fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke="var(--accent)" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} className="transition-[stroke-dashoffset] duration-1000" /></svg>
    <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-xl font-bold tabular-nums">{Math.round(value)}%</div><div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div></div></div>
  </div>;
}
export function CodeBlock({ code, className = '' }: { code: string; className?: string }) {
  return <pre className={`overflow-auto rounded-xl bg-[var(--code-bg)] text-[var(--code-fg)] p-3 text-[13px] leading-relaxed font-mono ${className}`} dangerouslySetInnerHTML={{ __html: highlight(code, null) }} />;
}
export function Section({ title, children, icon }: { title: string; children: ReactNode; icon?: string }) {
  return <section className="space-y-2"><h3 className="text-base font-semibold flex items-center gap-2">{icon && <span aria-hidden>{icon}</span>}{title}</h3>{children}</section>;
}
export function Confirm({ open, title, body, confirmWord, onConfirm, onClose, danger = true }: { open: boolean; title: string; body: ReactNode; confirmWord?: string; onConfirm: () => void; onClose: () => void; danger?: boolean }) {
  const [txt, setTxt] = useState('');
  useEffect(() => { if (open) setTxt(''); }, [open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 anim-fade" role="dialog" aria-modal="true" aria-label={title}>
    <Card className="max-w-md w-full space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="text-sm text-[var(--muted)]">{body}</div>
      {confirmWord && <input autoFocus aria-label={`Type ${confirmWord} to confirm`} placeholder={`Type ${confirmWord} to confirm`} value={txt} onChange={(e) => setTxt(e.target.value)} className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2" />}
      <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind={danger ? 'danger' : 'primary'} disabled={!!confirmWord && txt !== confirmWord} onClick={() => { onConfirm(); onClose(); }}>Confirm</Btn></div>
    </Card>
  </div>;
}
export function Empty({ icon, title, body, action }: { icon: string; title: string; body: string; action?: ReactNode }) {
  return <div className="text-center py-10 space-y-2"><div className="text-4xl" aria-hidden>{icon}</div><div className="font-semibold">{title}</div><p className="text-sm text-[var(--muted)] max-w-sm mx-auto">{body}</p>{action}</div>;
}
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return <div className="rounded-2xl bg-[var(--chip)] p-3"><div className="text-xs text-[var(--muted)]">{label}</div><div className="text-2xl font-bold tabular-nums">{value}</div>{sub && <div className="text-xs text-[var(--muted)]">{sub}</div>}</div>;
}
