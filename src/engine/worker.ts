// Runs user code in an isolated Web Worker: no DOM, no localStorage, no app state.
import { runProgram } from './runtime';
import { installFlutter } from './flutter';
self.onmessage = (e: MessageEvent) => {
  const { id, code, limits } = e.data;
  const r = runProgram(code, limits, installFlutter);
  (self as any).postMessage({ id, ok: r.ok, output: r.output, error: r.error ?? null, hasRoot: !!r.interp?.rootWidget });
};
