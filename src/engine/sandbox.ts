// Cancellable, isolated execution. Falls back to in-thread execution when Workers are unavailable (tests).
import { runProgram, type RunLimits } from './runtime';
import { installFlutter } from './flutter';
import SandboxWorker from './worker?worker&inline';

export interface SandboxResult { ok: boolean; output: string[]; error: { message: string; line: number; col: number; kind: string } | null; hasRoot: boolean; cancelled?: boolean; isolated: boolean }
let worker: Worker | null = null;
let seq = 0;
let pending: { id: number; resolve: (r: SandboxResult) => void; timer: any } | null = null;

function spawn(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try { const w = new SandboxWorker(); w.onmessage = (e) => { if (pending && e.data.id === pending.id) { clearTimeout(pending.timer); const p = pending; pending = null; p.resolve({ ...e.data, isolated: true }); } }; return w; } catch { return null; }
}
export function cancelRun(reason = 'Execution cancelled by the user.') {
  if (!pending) return;
  worker?.terminate(); worker = null;
  clearTimeout(pending.timer);
  const p = pending; pending = null;
  p.resolve({ ok: false, output: [], error: { message: 'Stopped: ' + reason, line: 0, col: 0, kind: 'limit' }, hasRoot: false, cancelled: true, isolated: true });
}
export function runIsolated(code: string, limits: Partial<RunLimits>): Promise<SandboxResult> {
  cancelRun('Superseded by a new run.');
  worker ??= spawn();
  if (!worker) {
    const r = runProgram(code, limits, installFlutter);
    return Promise.resolve({ ok: r.ok, output: r.output, error: r.error ?? null, hasRoot: !!r.interp?.rootWidget, isolated: false });
  }
  const id = ++seq;
  return new Promise((resolve) => {
    // Watchdog: hard-terminates the worker even if the engine's own limits fail.
    const timer = setTimeout(() => cancelRun(`watchdog terminated the worker after ${(limits.maxMs ?? 2500) + 2000} ms.`), (limits.maxMs ?? 2500) + 2000);
    pending = { id, resolve, timer };
    worker!.postMessage({ id, code, limits });
  });
}
export const isRunning = () => !!pending;
