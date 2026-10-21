// Dart-subset lexer. Produces tokens with line/column info for diagnostics.
export type TokType = 'num' | 'str' | 'id' | 'kw' | 'op' | 'eof';
export type StrPart = string | { code: string; line: number; col: number };
export interface Tok { t: TokType; v: string; line: number; col: number; parts?: StrPart[]; isDouble?: boolean; pos?: number; end?: number }

export class DartSyntaxError extends Error {
  line: number; col: number; unsupported: boolean;
  constructor(msg: string, line: number, col: number, unsupported = false) {
    super(msg); this.line = line; this.col = col; this.unsupported = unsupported;
  }
}

export const KEYWORDS = new Set([
  'var', 'final', 'const', 'late', 'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'switch', 'case',
  'default', 'class', 'extends', 'implements', 'with', 'abstract', 'new', 'this', 'super', 'null', 'true', 'false', 'is',
  'as', 'in', 'void', 'try', 'catch', 'finally', 'throw', 'on', 'required', 'static', 'get', 'set', 'enum', 'async',
  'await', 'factory', 'import', 'operator', 'rethrow', 'assert', 'typedef', 'mixin', 'extension', 'sealed', 'yield',
  'covariant', 'export', 'library', 'part', 'external', 'interface', 'base',
]);
// Contextual keywords that can still be used as identifiers.
export const SOFT_KEYWORDS = new Set(['get', 'set', 'on', 'async', 'required', 'operator', 'covariant', 'interface', 'base', 'sealed', 'mixin', 'extension', 'typedef', 'factory', 'static', 'abstract', 'implements', 'library', 'part', 'export', 'external', 'late', 'yield', 'show', 'hide']);

const OPS = [
  '...?', '~/=', '??=', '...', '>>>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '=>', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '~/', '..', '|=', '&=', '+', '-', '*', '/', '%', '<', '>', '=', '!', '?', ':', ';', ',', '.', '(', ')', '[', ']', '{', '}', '@', '#', '&', '|', '^', '~',
];

export function lex(src: string, lineOffset = 0, colOffset = 0): Tok[] {
  const toks: Tok[] = [];
  let i = 0, line = 1 + lineOffset, col = 1 + colOffset;
  const n = src.length;
  const adv = (k = 1) => {
    for (let j = 0; j < k; j++) {
      if (src[i] === '\n') { line++; col = 1; } else col++;
      i++;
    }
  };
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { adv(); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') adv(); continue; }
    if (c === '/' && src[i + 1] === '*') {
      const sl = line, sc = col; adv(2); let depth = 1;
      while (i < n && depth > 0) {
        if (src[i] === '/' && src[i + 1] === '*') { depth++; adv(2); }
        else if (src[i] === '*' && src[i + 1] === '/') { depth--; adv(2); }
        else adv();
      }
      if (depth > 0) throw new DartSyntaxError('Unterminated block comment', sl, sc);
      continue;
    }
    const sl = line, sc = col, si = i;
    // numbers
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let s = '';
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        s = '0x'; adv(2);
        while (i < n && /[0-9a-fA-F]/.test(src[i])) { s += src[i]; adv(); }
        toks.push({ t: 'num', v: String(parseInt(s, 16)), line: sl, col: sc, pos: si, end: i });
        continue;
      }
      let isDouble = false;
      while (i < n && /[0-9]/.test(src[i])) { s += src[i]; adv(); }
      if (src[i] === '.' && /[0-9]/.test(src[i + 1] || '')) {
        isDouble = true; s += '.'; adv();
        while (i < n && /[0-9]/.test(src[i])) { s += src[i]; adv(); }
      }
      if ((src[i] === 'e' || src[i] === 'E') && /[0-9+-]/.test(src[i + 1] || '')) {
        isDouble = true; s += 'e'; adv();
        if (src[i] === '+' || src[i] === '-') { s += src[i]; adv(); }
        while (i < n && /[0-9]/.test(src[i])) { s += src[i]; adv(); }
      }
      toks.push({ t: 'num', v: s, line: sl, col: sc, isDouble, pos: si, end: i });
      continue;
    }
    // strings
    let raw = false;
    if (c === 'r' && (src[i + 1] === '"' || src[i + 1] === "'")) { raw = true; adv(); }
    const q = src[i];
    if (q === '"' || q === "'") {
      const triple = src[i + 1] === q && src[i + 2] === q;
      adv(triple ? 3 : 1);
      const parts: StrPart[] = [];
      let buf = '';
      for (;;) {
        if (i >= n) throw new DartSyntaxError('Unterminated string literal', sl, sc);
        const ch = src[i];
        if (triple) {
          if (ch === q && src[i + 1] === q && src[i + 2] === q) { adv(3); break; }
        } else {
          if (ch === q) { adv(); break; }
          if (ch === '\n') throw new DartSyntaxError('Unterminated string literal (newline in single-line string)', sl, sc);
        }
        if (ch === '\\' && !raw) {
          const e = src[i + 1];
          const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', $: '$', b: '\b', '0': '\0' };
          if (e === 'u') {
            let hex = '';
            if (src[i + 2] === '{') { let k = i + 3; while (src[k] !== '}' && k < n) hex += src[k++]; adv(hex.length + 4); }
            else { hex = src.substr(i + 2, 4); adv(6); }
            buf += String.fromCodePoint(parseInt(hex, 16) || 63);
            continue;
          }
          buf += map[e] ?? e; adv(2); continue;
        }
        if (ch === '$' && !raw) {
          if (src[i + 1] === '{') {
            if (buf) { parts.push(buf); buf = ''; }
            adv(2);
            const el = line, ec = col;
            let depth = 1, code = '';
            while (i < n) {
              if (src[i] === '{') depth++;
              if (src[i] === '}') { depth--; if (depth === 0) break; }
              if (src[i] === '"' || src[i] === "'") {
                // copy nested string verbatim
                const qq = src[i]; code += qq; adv();
                while (i < n && src[i] !== qq) { if (src[i] === '\\') { code += src[i]; adv(); } code += src[i]; adv(); }
              }
              code += src[i]; adv();
            }
            if (i >= n) throw new DartSyntaxError('Unterminated ${...} interpolation', el, ec);
            adv();
            parts.push({ code, line: el - 1, col: ec - 1 });
            continue;
          }
          if (/[A-Za-z_]/.test(src[i + 1] || '')) {
            if (buf) { parts.push(buf); buf = ''; }
            adv();
            const el = line, ec = col;
            let id = '';
            while (i < n && /[A-Za-z0-9_]/.test(src[i])) { id += src[i]; adv(); }
            parts.push({ code: id, line: el - 1, col: ec - 1 });
            continue;
          }
          throw new DartSyntaxError("A '$' sign must be followed by an identifier or '{' (escape it as \\$)", line, col);
        }
        buf += ch; adv();
      }
      if (buf || parts.length === 0) parts.push(buf);
      toks.push({ t: 'str', v: parts.filter((p) => typeof p === 'string').join(''), line: sl, col: sc, parts, pos: si, end: i });
      continue;
    }
    if (raw) { i--; col--; }
    if (/[A-Za-z_$]/.test(c)) {
      let s = '';
      while (i < n && /[A-Za-z0-9_$]/.test(src[i])) { s += src[i]; adv(); }
      toks.push({ t: KEYWORDS.has(s) ? 'kw' : 'id', v: s, line: sl, col: sc, pos: si, end: i });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new DartSyntaxError(`Unexpected character '${c}'`, sl, sc);
    if (op === '>>>' ) { // never treat as shift; split for generics
      toks.push({ t: 'op', v: '>', line: sl, col: sc, pos: si, end: si + 1 }); adv(); continue;
    }
    toks.push({ t: 'op', v: op, line: sl, col: sc, pos: si, end: si + op.length });
    adv(op.length);
  }
  toks.push({ t: 'eof', v: '<end of file>', line, col, pos: i, end: i });
  return toks;
}
