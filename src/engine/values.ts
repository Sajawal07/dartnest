// Runtime value model for the Dart subset.
import type { Node, TypeRef } from './parser';

export class DDouble { constructor(public v: number) {} }
export class DIter { constructor(public items: any[]) {} }
export class NativeFn { constructor(public name: string, public fn: (args: any[], named: Record<string, any>) => any) {} }
export class NType {
  constructor(public name: string, public statics: Record<string, any> = {}, public call?: (args: any[], named: Record<string, any>) => any) {}
}
export class Slot { constructor(public name: string, public v: any, public final = false, public type: TypeRef | null = null) {} }
export const UNINIT = Symbol('uninitialized');
export const SHORT = Symbol('short-circuit');

export class Env {
  vars = new Map<string, Slot>();
  fnInfo: { isAsync: boolean; name: string } | null = null;
  defCls: DClass | null = null;
  constructor(public parent: Env | null, public inst: DInstance | null = null, public cls: DClass | null = null) {}
  declare(name: string, v: any, final = false, type: TypeRef | null = null) { const s = new Slot(name, v, final, type); this.vars.set(name, s); return s; }
}

export class DClass {
  superclass: DClass | null = null;
  methods = new Map<string, Node>();
  getters = new Map<string, Node>();
  setters = new Map<string, Node>();
  ctors = new Map<string, Node>();
  fieldDecls: Node[] = [];
  statics = new Map<string, Slot>();
  staticMethods = new Map<string, Node>();
  staticGetters = new Map<string, Node>();
  fieldTypes = new Map<string, TypeRef | null>();
  finals = new Set<string>();
  interfaces: string[] = [];
  mixins: string[] = [];
  isAbstract = false;
  isPrelude = false;
  constructor(public name: string, public decl: Node, public defEnv: Env) {}
  chain(): DClass[] { const out: DClass[] = []; let c: DClass | null = this; while (c) { out.push(c); c = c.superclass; } return out; }
  isSubOf(name: string): boolean {
    for (const c of this.chain()) { if (c.name === name || c.interfaces.includes(name) || c.mixins.includes(name)) return true; }
    return false;
  }
}

let instSeq = 0;
export class DInstance {
  fields = new Map<string, any>();
  constructing = true;
  id = ++instSeq;
  constructor(public cls: DClass) {}
}
export class DEnumValue { constructor(public enumName: string, public name: string, public index: number) {} }
export class DEnum { values: DEnumValue[]; constructor(public name: string, names: string[]) { this.values = names.map((n, i) => new DEnumValue(name, n, i)); } }
export class DFuture { handled = false; constructor(public value: any, public error: any = null, public failed = false) {} }

let nobjSeq = 0;
export class NObj {
  id = ++nobjSeq;
  src: any = null;
  constructor(public kind: string, public props: Record<string, any> = {}, public isWidget = false, public ctor = '') {}
}

export class Closure {
  constructor(public decl: { params: any[]; body: Node; isAsync?: boolean; name?: string; retType?: TypeRef | null }, public env: Env, public thisObj: DInstance | null = null, public cls: DClass | null = null) {}
}

// Control-flow signals (plain objects for speed)
export class BreakSig {}
export class ContinueSig {}
export class ReturnSig { constructor(public value: any) {} }
export class DartThrow { constructor(public value: any, public stack: string) {} }
export class EngineError extends Error {
  constructor(msg: string, public line = 0, public col = 0, public kind: 'compile' | 'runtime' | 'limit' | 'unsupported' = 'runtime') { super(msg); }
}

export const unmodifiable = new WeakSet<object>();

export const isNum = (v: any) => typeof v === 'number' || v instanceof DDouble;
export const numVal = (v: any): number => (typeof v === 'number' ? v : (v as DDouble).v);

export function typeName(v: any): string {
  if (v === null || v === undefined) return 'Null';
  if (typeof v === 'number') return 'int';
  if (v instanceof DDouble) return 'double';
  if (typeof v === 'string') return 'String';
  if (typeof v === 'boolean') return 'bool';
  if (Array.isArray(v)) return 'List<dynamic>';
  if (v instanceof Map) return 'Map<dynamic, dynamic>';
  if (v instanceof Set) return 'Set<dynamic>';
  if (v instanceof DIter) return 'Iterable<dynamic>';
  if (v instanceof DInstance) return v.cls.name;
  if (v instanceof DEnumValue) return v.enumName;
  if (v instanceof Closure || v instanceof NativeFn) return 'Function';
  if (v instanceof DFuture) return 'Future<dynamic>';
  if (v instanceof NObj) return v.kind;
  if (v instanceof NType) return 'Type';
  if (v instanceof DClass || v instanceof DEnum) return 'Type';
  return 'Object';
}

export function fmtDouble(x: number): string {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Infinity';
  if (x === -Infinity) return '-Infinity';
  if (Number.isInteger(x) && Math.abs(x) < 1e21) return x.toFixed(1);
  return String(x);
}

export function toStr(v: any, interp?: { instanceToString(i: DInstance): string | null }): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  if (typeof v === 'boolean') return String(v);
  if (v instanceof DDouble) return fmtDouble(v.v);
  if (Array.isArray(v)) return '[' + v.map((x) => toStr(x, interp)).join(', ') + ']';
  if (v instanceof DIter) return '(' + v.items.map((x) => toStr(x, interp)).join(', ') + ')';
  if (v instanceof Set) return '{' + [...v].map((x) => toStr(x, interp)).join(', ') + '}';
  if (v instanceof Map) return '{' + [...v].map(([k, x]) => toStr(k, interp) + ': ' + toStr(x, interp)).join(', ') + '}';
  if (v instanceof DInstance) { const s = interp?.instanceToString(v); return s ?? `Instance of '${v.cls.name}'`; }
  if (v instanceof DEnumValue) return `${v.enumName}.${v.name}`;
  if (v instanceof Closure) return `Closure: (${v.decl.params.map((p: any) => p.type?.name ?? 'dynamic').join(', ')}) => ${v.decl.retType?.name ?? 'dynamic'}`;
  if (v instanceof NativeFn) return `Closure: ${v.name}`;
  if (v instanceof DFuture) return "Instance of 'Future<dynamic>'";
  if (v instanceof DClass || v instanceof DEnum || v instanceof NType) return v.name;
  if (v instanceof NObj) {
    if (v.kind === 'Color') return `Color(0x${(v.props.value >>> 0).toString(16).padStart(8, '0')})`;
    if (v.kind === 'Duration') { const ms = v.props.ms; const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = (ms % 60000) / 1000; return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(6).padStart(9, '0')}`; }
    if (v.kind === 'IconData') return `IconData(${v.props.name})`;
    if (v.kind === 'EdgeInsets') { const p = v.props; return `EdgeInsets(${[p.left, p.top, p.right, p.bottom].map((n: number) => n.toFixed(1)).join(', ')})`; }
    if (v.kind === 'Size') return `Size(${fmtDouble(v.props.width)}, ${fmtDouble(v.props.height)})`;
    if (v.kind === 'TextEditingController') return `TextEditingController(text: "${v.props.text}")`;
    if (v.isWidget) return v.kind;
    return `Instance of '${v.kind}'`;
  }
  return String(v);
}

export function dartEquals(a: any, b: any, interp?: { instanceEquals(a: DInstance, b: any): boolean | null }): boolean {
  if (isNum(a) && isNum(b)) return numVal(a) === numVal(b);
  if (a instanceof DInstance && interp) { const r = interp.instanceEquals(a, b); if (r !== null) return r; }
  if (a instanceof NObj && b instanceof NObj && !a.isWidget && a.kind === b.kind && ['Color', 'Duration', 'IconData', 'EdgeInsets', 'Size'].includes(a.kind)) return JSON.stringify(a.props) === JSON.stringify(b.props);
  return a === b;
}

export function freeze(v: any) {
  if (Array.isArray(v) || v instanceof Map || v instanceof Set) {
    unmodifiable.add(v);
    for (const x of v instanceof Map ? v.values() : v) freeze(x);
  }
  return v;
}
