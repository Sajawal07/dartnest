// Deterministic assessment harness: parses, executes and behaviourally tests user code.
import { parseProgram } from './parser';
import { DartSyntaxError } from './lexer';
import { Interpreter, formatError } from './runtime';
import { installFlutter, resolveRoot, walk, textOf, RNode, fire, isWidgetLike } from './flutter';
import { DFuture, NObj, Closure, NativeFn, DClass } from './values';

export type Step =
  | ['text', string] | ['notext', string] | ['tap', string] | ['enter', number, string] | ['toggle', number]
  | ['has', string, number?] | ['eval', string, string] | ['within', string, string] | ['prop', string, string, string] | ['slider', number, number]
  | ['select', number, string] | ['width', number];
export interface LogicTest { expr: string; expect: string; name?: string }
export interface UiTest { name: string; steps: Step[] }
export interface TaskDef {
  id: string; title: string; kind: 'logic' | 'ui'; fn?: string;
  statement: string; expected: string; io?: string; constraints?: string; allowed?: string;
  starter: string; solution: string; hints: string[];
  tests: (LogicTest | UiTest)[];
}
export interface TestResult { name: string; passed: boolean; detail: string; points: number; max: number }
export interface GradeResult {
  status: 'graded' | 'unsupported' | 'syntax';
  score: number; max: number; percent: number; passed: boolean;
  breakdown: TestResult[]; message: string; output: string[];
}

export const PREVIEW_ENV = { width: 360, height: 640 };
export const PASS_PERCENT = 70;

function fresh(ast: any): Interpreter {
  const I = new Interpreter(ast, { maxSteps: 400_000, maxMs: 1500 });
  I.hooks.installFlutter = installFlutter;
  I.load();
  return I;
}
function unwrap(v: any) { if (v instanceof DFuture) { if (v.failed) throw new Error('Future completed with error'); return v.value; } return v; }

export class UiDriver {
  tree: RNode | null = null;
  env = { ...PREVIEW_ENV };
  constructor(public I: Interpreter) { this.render(); }
  render() { this.tree = resolveRoot(this.I, this.env); return this.tree; }
  all(type?: string): RNode[] { const out: RNode[] = []; walk(this.tree, (n) => { if (!type || n.type === type) out.push(n); }); return out; }
  texts(): string[] { return this.all('Text').map((n) => n.props.data); }
  tap(label: string): string | null {
    const tappable = ['ElevatedButton', 'TextButton', 'OutlinedButton', 'FilledButton', 'IconButton', 'FloatingActionButton', 'ListTile', 'GestureDetector', 'InkWell', 'Chip'];
    const cands = this.all().filter((n) => tappable.includes(n.type));
    const match = cands.find((n) => textOf(n).trim() === label) ?? cands.find((n) => textOf(n).includes(label))
      ?? cands.find((n) => n.props.tooltip === label) ?? cands.find((n) => { let ic = ''; walk(n, (x) => { if (x.type === 'Icon') ic = x.props.icon.props.name; }); return ic === label; });
    if (!match) return `No tappable widget labelled '${label}' was found.`;
    const cb = match.props.onPressed ?? match.props.onTap;
    if (!cb) return `The widget labelled '${label}' is disabled (onPressed/onTap is null).`;
    fire(this.I, cb, []);
    this.render();
    return null;
  }
  enter(i: number, text: string): string | null {
    const fields = this.all().filter((n) => n.type === 'TextField' || n.type === 'TextFormField');
    const f = fields[i];
    if (!f) return `TextField #${i + 1} not found (found ${fields.length}).`;
    const c = f.props.controller;
    if (c instanceof NObj) { c.props.text = text; c.props.__onSet?.(); }
    if (f.type === 'TextFormField') (this.I.hooks.fieldText ??= new Map()).set(f.id, text);
    if (f.props.onChanged) fire(this.I, f.props.onChanged, [text]);
    this.render();
    return null;
  }
  toggle(i: number): string | null {
    const ts = this.all().filter((n) => ['Switch', 'Checkbox', 'SwitchListTile', 'CheckboxListTile'].includes(n.type));
    const t = ts[i];
    if (!t) return `Switch/Checkbox #${i + 1} not found.`;
    if (!t.props.onChanged) return 'The toggle is disabled (onChanged is null).';
    fire(this.I, t.props.onChanged, [!t.props.value]);
    this.render();
    return null;
  }
}

export function runSteps(I: Interpreter, steps: Step[]): { ok: boolean; detail: string } {
  I.resetBudget();
  I.runMain();
  if (!I.rootWidget) return { ok: false, detail: 'main() did not call runApp(...) with a widget.' };
  const d = new UiDriver(I);
  for (const s of steps) {
    let err: string | null = null;
    switch (s[0]) {
      case 'text': if (!d.texts().some((t) => t === s[1] || t.includes(s[1]))) err = `Expected to find text '${s[1]}'. Visible text: ${JSON.stringify(d.texts().slice(0, 8))}`; break;
      case 'notext': if (d.texts().some((t) => t.includes(s[1]))) err = `Text '${s[1]}' should not be visible.`; break;
      case 'tap': err = d.tap(s[1]); break;
      case 'enter': err = d.enter(s[1], s[2]); break;
      case 'toggle': err = d.toggle(s[1]); break;
      case 'slider': { const sl = d.all('Slider')[s[1]]; if (!sl) err = 'Slider not found.'; else { fire(I, sl.props.onChanged, [s[2]]); d.render(); } break; }
      case 'select': {
        const dd = d.all('DropdownButton')[s[1]];
        if (!dd) { err = `DropdownButton #${s[1] + 1} not found.`; break; }
        const items = Array.isArray(dd.props.items) ? dd.props.items : [];
        const it = items.find((x: any) => I.str(x.props.value) === s[2]);
        if (!it) { err = `Dropdown has no item with value '${s[2]}'.`; break; }
        if (!dd.props.onChanged) { err = 'The dropdown is disabled (onChanged is null).'; break; }
        fire(I, dd.props.onChanged, [it.props.value]); d.render(); break;
      }
      case 'width': d.env = { width: s[1], height: PREVIEW_ENV.height }; d.render(); break;
      case 'has': { const n = d.all(s[1]).length; if (s[2] === undefined ? n === 0 : n !== s[2]) err = s[2] === undefined ? `Expected a ${s[1]} widget in the tree.` : `Expected ${s[2]} × ${s[1]} but found ${n}.`; break; }
      case 'within': { const ok = d.all(s[1]).some((n) => textOf(n).includes(s[2])); if (!ok) err = `Expected a ${s[1]} containing the text '${s[2]}'.`; break; }
      case 'prop': {
        const ok = d.all(s[1]).some((n) => { const v = s[2].split('.').reduce((o: any, k) => (o instanceof NObj ? o.props[k] : o?.[k]), n.props); return v !== undefined && I.str(v) === s[3]; });
        if (!ok) err = `Expected a ${s[1]} with ${s[2]} = ${s[3]}.`; break;
      }
      case 'eval': { const v = unwrap(I.evalSource(s[1])); if (I.str(v) !== s[2]) err = `${s[1]} should be ${s[2]} but was ${I.str(v)}.`; break; }
    }
    if (err) return { ok: false, detail: err };
  }
  return { ok: true, detail: 'All checks passed.' };
}

export function grade(task: TaskDef, code: string): GradeResult {
  const breakdown: TestResult[] = [];
  let ast: any;
  try { ast = parseProgram(code); }
  catch (e) {
    const f = formatError(e);
    const unsupported = e instanceof DartSyntaxError && e.unsupported;
    return { status: unsupported ? 'unsupported' : 'syntax', score: 0, max: 100, percent: 0, passed: false, breakdown: [{ name: 'Code parses', passed: false, detail: `${f.message} (line ${f.line})`, points: 0, max: 10 }], message: unsupported ? 'Your code uses a feature the offline engine cannot execute. This is a limitation of the engine, not necessarily an error in your Dart — rewrite using the supported subset to be graded.' : 'Fix the syntax error and try again.', output: [] };
  }
  breakdown.push({ name: 'Code parses (syntax)', passed: true, detail: 'Valid syntax for the supported subset.', points: 10, max: 10 });
  // structure / signature
  let structOk = false, structDetail = '';
  let output: string[] = [];
  try {
    const I = fresh(ast);
    if (task.kind === 'logic') {
      const f = I.globals.vars.get(task.fn!);
      structOk = !!f && (f.v instanceof Closure || f.v instanceof DClass || f.v instanceof NativeFn);
      structDetail = structOk ? `'${task.fn}' is declared.` : `Required declaration '${task.fn}' was not found.`;
    } else {
      I.runMain();
      output = I.output;
      if (isWidgetLike(I, I.rootWidget)) { resolveRoot(I, PREVIEW_ENV); structOk = true; structDetail = 'main() calls runApp() and the widget tree builds.'; }
      else structDetail = 'main() must call runApp(...) with a widget.';
    }
  } catch (e) { structDetail = formatError(e).message; }
  breakdown.push({ name: task.kind === 'logic' ? 'Required signature present' : 'App builds a widget tree', passed: structOk, detail: structDetail, points: structOk ? 10 : 0, max: 10 });
  const per = 80 / task.tests.length;
  task.tests.forEach((t, i) => {
    let passed = false, detail = '';
    try {
      const I = fresh(ast);
      if ('expr' in t) {
        const v = unwrap(I.evalSource(t.expr));
        const got = I.str(v);
        passed = got === t.expect;
        detail = passed ? `${t.expr} → ${got}` : `${t.expr} should return ${t.expect} but returned ${got}`;
      } else {
        const r = runSteps(I, t.steps);
        passed = r.ok; detail = r.detail;
      }
    } catch (e) { detail = formatError(e).message.split('\n').slice(0, 2).join(' '); }
    const name = 'expr' in t ? (t.name ?? `Test ${i + 1}: ${t.expr}`) : t.name;
    breakdown.push({ name, passed, detail, points: passed ? per : 0, max: per });
  });
  const score = Math.round(breakdown.reduce((s, b) => s + b.points, 0));
  const passed = score >= PASS_PERCENT && breakdown[1].passed;
  return { status: 'graded', score, max: 100, percent: score, passed, breakdown, message: passed ? 'Practical passed.' : `Practical not passed — ${PASS_PERCENT}% required.`, output };
}
