import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';

const KW = new Set('abstract as assert async await break case catch class const continue default do else enum extends factory false final finally for get if implements import in is late mixin new null on operator required rethrow return sealed set static super switch this throw true try var void when while with yield'.split(' '));
const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")|(\b\d+(?:\.\d+)?\b|\b0x[0-9a-fA-F]+\b)|(@\w+)|([A-Za-z_]\w*)|([{}()[\]])/g;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(code: string, match: [number, number] | null): string {
  let out = ''; let last = 0;
  code.replace(TOKEN, (m, com, str, num, ann, id, br, off: number) => {
    out += esc(code.slice(last, off)); last = off + m.length;
    let cls = '';
    if (com) cls = 'tk-com'; else if (str) cls = 'tk-str'; else if (num) cls = 'tk-num'; else if (ann) cls = 'tk-ann';
    else if (id) cls = KW.has(id) ? 'tk-kw' : /^[A-Z]/.test(id) ? 'tk-type' : /^(print|runApp|setState|main)$/.test(id) ? 'tk-fn' : '';
    else if (br) cls = match && (off === match[0] || off === match[1]) ? 'tk-match' : 'tk-br';
    out += cls ? `<span class="${cls}">${esc(m)}</span>` : esc(m);
    return m;
  });
  return out + esc(code.slice(last)) + '\n';
}

export function reindent(code: string): string {
  let depth = 0;
  return code.split('\n').map((raw) => {
    const line = raw.trim();
    if (!line) return '';
    const closers = (line.match(/^[}\])]+/) || [''])[0].length;
    const d = Math.max(0, depth - closers);
    const stripped = line.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\/\/.*$/g, '');
    for (const ch of stripped) { if ('{[('.includes(ch)) depth++; else if ('}])'.includes(ch)) depth = Math.max(0, depth - 1); }
    return '  '.repeat(d) + line;
  }).join('\n').replace(/\n{3,}/g, '\n\n');
}

function matchBracket(code: string, pos: number): [number, number] | null {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const rev: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (const p of [pos - 1, pos]) {
    const c = code[p];
    if (pairs[c]) { let d = 0; for (let i = p; i < code.length; i++) { if (code[i] === c) d++; else if (code[i] === pairs[c]) { d--; if (d === 0) return [p, i]; } } }
    if (rev[c]) { let d = 0; for (let i = p; i >= 0; i--) { if (code[i] === c) d++; else if (code[i] === rev[c]) { d--; if (d === 0) return [i, p]; } } }
  }
  return null;
}

export interface EditorHandle { undo(): void; redo(): void; format(): void; focusLine(line: number): void }
interface Props { value: string; onChange: (v: string) => void; fontSize?: number; errorLine?: number | null; lineNumbers?: boolean; minHeight?: number; label?: string }

export const Editor = forwardRef<EditorHandle, Props>(function Editor({ value, onChange, fontSize = 14, errorLine, lineNumbers = true, minHeight = 320, label = 'Dart code editor' }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const hist = useRef<{ stack: string[]; i: number }>({ stack: [value], i: 0 });
  const [caret, setCaret] = useState(0);
  const lastPush = useRef(0);

  useEffect(() => { // external value changes (reset/load) start a new undo entry
    const h = hist.current;
    if (h.stack[h.i] !== value) { h.stack = [...h.stack.slice(0, h.i + 1), value].slice(-200); h.i = h.stack.length - 1; }
  }, [value]);

  const commit = (v: string, sel?: number) => {
    const h = hist.current; const now = Date.now();
    if (now - lastPush.current > 600 || h.i === 0) { h.stack = [...h.stack.slice(0, h.i + 1), v].slice(-200); h.i = h.stack.length - 1; }
    else { h.stack[h.i] = v; }
    lastPush.current = now;
    onChange(v);
    if (sel !== undefined) requestAnimationFrame(() => { if (ta.current) { ta.current.selectionStart = ta.current.selectionEnd = sel; setCaret(sel); } });
  };
  useImperativeHandle(ref, () => ({
    undo() { const h = hist.current; if (h.i > 0) { h.i--; onChange(h.stack[h.i]); } },
    redo() { const h = hist.current; if (h.i < h.stack.length - 1) { h.i++; onChange(h.stack[h.i]); } },
    format() { commit(reindent(value)); lastPush.current = 0; },
    focusLine(line: number) {
      const el = ta.current; if (!el) return;
      const idx = value.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
      el.focus(); el.selectionStart = el.selectionEnd = idx;
      el.scrollTop = Math.max(0, (line - 4) * fontSize * 1.5);
    },
  }));

  const lines = value.split('\n').length;
  const html = useMemo(() => highlight(value, matchBracket(value, caret)), [value, caret]);
  const sync = () => { if (ta.current && pre.current) { pre.current.scrollTop = ta.current.scrollTop; pre.current.scrollLeft = ta.current.scrollLeft; if (gutter.current) gutter.current.scrollTop = ta.current.scrollTop; } };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget; const s = el.selectionStart, en = el.selectionEnd;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) (ref as any)?.current?.redo?.(); else { const h = hist.current; if (h.i > 0) { h.i--; onChange(h.stack[h.i]); } } return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); const h = hist.current; if (h.i < h.stack.length - 1) { h.i++; onChange(h.stack[h.i]); } return; }
    if (e.key === 'Tab') { e.preventDefault(); lastPush.current = 0; commit(value.slice(0, s) + '  ' + value.slice(en), s + 2); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const indent = (value.slice(lineStart, s).match(/^\s*/) || [''])[0];
      const prev = value[s - 1], next = value[s];
      lastPush.current = 0;
      if ('{[('.includes(prev) && next && '}])'.includes(next)) { const ins = '\n' + indent + '  ' + '\n' + indent; commit(value.slice(0, s) + ins + value.slice(en), s + indent.length + 3); return; }
      const extra = prev && '{[('.includes(prev) ? '  ' : '';
      commit(value.slice(0, s) + '\n' + indent + extra + value.slice(en), s + 1 + indent.length + extra.length);
      return;
    }
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', "'": "'", '"': '"' };
    if (pairs[e.key] && s === en) { e.preventDefault(); commit(value.slice(0, s) + e.key + pairs[e.key] + value.slice(en), s + 1); return; }
    if ([')', ']', '}', "'", '"'].includes(e.key) && value[s] === e.key && s === en) { e.preventDefault(); requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 1; setCaret(s + 1); }); return; }
    if (e.key === 'Backspace' && s === en && pairs[value[s - 1]] === value[s] && value[s]) { e.preventDefault(); commit(value.slice(0, s - 1) + value.slice(s + 1), s - 1); }
  };

  const lh = fontSize * 1.5;
  const common: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize, lineHeight: `${lh}px`, padding: '12px 12px', margin: 0, whiteSpace: 'pre', tabSize: 2, overflowWrap: 'normal' };
  return (
    <div className="code-editor relative flex rounded-xl border border-[var(--line)] bg-[var(--code-bg)] overflow-hidden" style={{ minHeight }}>
      {lineNumbers && (
        <div ref={gutter} aria-hidden className="select-none overflow-hidden text-right text-[var(--muted)] border-r border-[var(--line)] bg-[var(--code-gutter)]" style={{ ...common, padding: '12px 8px', minWidth: 44 }}>
          {Array.from({ length: lines }, (_, i) => <div key={i} style={{ height: lh, color: errorLine === i + 1 ? '#ef4444' : undefined, fontWeight: errorLine === i + 1 ? 700 : undefined }}>{errorLine === i + 1 ? '●' : i + 1}</div>)}
        </div>
      )}
      <div className="relative flex-1 min-w-0">
        {errorLine ? <div aria-hidden className="absolute left-0 right-0 bg-red-500/15 pointer-events-none" style={{ top: 12 + (errorLine - 1) * lh - (ta.current?.scrollTop ?? 0), height: lh }} /> : null}
        <pre ref={pre} aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none text-[var(--code-fg)]" style={common} dangerouslySetInnerHTML={{ __html: html }} />
        <textarea
          ref={ta} aria-label={label} spellCheck={false} autoCapitalize="off" autoCorrect="off" value={value}
          onChange={(e) => { commit(e.target.value); setCaret(e.target.selectionStart); }}
          onKeyDown={onKeyDown} onScroll={sync} onSelect={(e) => setCaret(e.currentTarget.selectionStart)} onClick={(e) => setCaret(e.currentTarget.selectionStart)}
          className="absolute inset-0 w-full h-full resize-none bg-transparent text-transparent caret-[var(--code-fg)] outline-none overflow-auto selection:bg-indigo-400/30"
          style={common}
        />
      </div>
    </div>
  );
});
