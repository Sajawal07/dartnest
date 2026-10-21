// Allow-listed core library. No access to host globals, files, network or timers.
import type { Interpreter } from './runtime';
import type { Node } from './parser';
import {
  DDouble, DIter, NativeFn, NType, DInstance, DEnumValue, DFuture, NObj, Closure, DClass,
  isNum, numVal, typeName, fmtDouble, unmodifiable, freeze,
} from './values';

export const PRELUDE = `
class Exception { final message; Exception([this.message]); String toString() => message == null ? 'Exception' : 'Exception: $message'; }
class FormatException { final message; FormatException([this.message = '']); String toString() => 'FormatException: $message'; }
class StateError { final message; StateError(this.message); String toString() => 'Bad state: $message'; }
class ArgumentError { final message; ArgumentError([this.message]); String toString() => 'Invalid argument(s): $message'; }
class RangeError { final message; RangeError(this.message); String toString() => '$message'; }
class UnsupportedError { final message; UnsupportedError(this.message); String toString() => 'Unsupported operation: $message'; }
class UnimplementedError { final message; UnimplementedError([this.message]); String toString() => 'UnimplementedError: \${message ?? ''}'; }
class TypeError { final message; TypeError([this.message]); String toString() => '$message'; }
class NoSuchMethodError { final message; NoSuchMethodError(this.message); String toString() => 'NoSuchMethodError: $message'; }
class AssertionError { final message; AssertionError([this.message]); String toString() => 'Assertion failed: $message'; }
class Error { Error(); }
class MapEntry { final key; final value; MapEntry(this.key, this.value); String toString() => 'MapEntry($key: $value)'; }
class ChangeNotifier {
  final List _listeners = [];
  void addListener(listener) { _listeners.add(listener); }
  void removeListener(listener) { _listeners.remove(listener); }
  bool get hasListeners => _listeners.isNotEmpty;
  void notifyListeners() { for (final l in [..._listeners]) { l(); } }
  void dispose() { _listeners.clear(); }
}
class ValueNotifier extends ChangeNotifier {
  var _value;
  ValueNotifier(this._value);
  get value => _value;
  set value(v) { if (v == _value) return; _value = v; notifyListeners(); }
}
`;

const toNum = (x: number, dbl: boolean) => (dbl ? new DDouble(x) : x);

function dartRound(x: number) { return x < 0 ? -Math.round(-x) : Math.round(x); }

export function installCore(I: Interpreter) {
  const g = I.globals;
  const nf = (name: string, fn: (a: any[], n: Record<string, any>) => any) => new NativeFn(name, fn);
  g.declare('print', nf('print', (a) => { if (a.length !== 1) I.cerr('print() takes exactly one argument.'); I.print(I.str(a[0])); return null; }), true);
  g.declare('identical', nf('identical', (a) => a[0] === a[1]), true);
  const parseInt_ = (s: any, radix?: number) => {
    if (typeof s !== 'string') I.cerr(`int.parse expects a String, got '${typeName(s)}'.`);
    const t = s.trim();
    if (radix === 16 ? !/^[+-]?[0-9a-fA-F]+$/.test(t) : !/^[+-]?\d+$/.test(t)) return null;
    return parseInt(t, radix ?? 10);
  };
  const parseDouble_ = (s: any) => { const t = String(s).trim(); if (!/^[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+|Infinity|NaN)$/.test(t)) return null; return new DDouble(Number(t)); };
  g.declare('int', new NType('int', {
    parse: nf('int.parse', (a, n) => { const r = parseInt_(a[0], n.radix); if (r === null) I.throwDart('FormatException', `Invalid radix-10 number (at character 1)\n${a[0]}`); return r; }),
    tryParse: nf('int.tryParse', (a, n) => parseInt_(a[0], n.radix)),
    maxFinite: 9007199254740991,
  }), true);
  g.declare('double', new NType('double', {
    parse: nf('double.parse', (a) => { const r = parseDouble_(a[0]); if (r === null) I.throwDart('FormatException', `Invalid double\n${a[0]}`); return r; }),
    tryParse: nf('double.tryParse', (a) => parseDouble_(a[0])),
    infinity: new DDouble(Infinity), nan: new DDouble(NaN), maxFinite: new DDouble(Number.MAX_VALUE),
  }), true);
  g.declare('num', new NType('num', { parse: nf('num.parse', (a) => { const i = parseInt_(a[0]); if (i !== null) return i; const d = parseDouble_(a[0]); if (d === null) I.throwDart('FormatException', `Invalid number\n${a[0]}`); return d; }) }), true);
  g.declare('String', new NType('String', { fromCharCode: nf('String.fromCharCode', (a) => String.fromCharCode(a[0])) }), true);
  g.declare('bool', new NType('bool'), true);
  g.declare('Object', new NType('Object'), true);
  g.declare('dynamic', new NType('dynamic'), true);
  g.declare('List', new NType('List', {
    filled: nf('List.filled', (a) => { I.checkSize(a[0]); return new Array(a[0]).fill(a[1]); }),
    generate: nf('List.generate', (a) => { I.checkSize(a[0]); const out = []; for (let i = 0; i < a[0]; i++) out.push(I.callValue(a[1], [i])); return out; }),
    empty: nf('List.empty', () => []),
    from: nf('List.from', (a) => [...I.iterItems(a[0])]),
    of: nf('List.of', (a) => [...I.iterItems(a[0])]),
    unmodifiable: nf('List.unmodifiable', (a) => freeze([...I.iterItems(a[0])])),
  }, () => []), true);
  g.declare('Map', new NType('Map', {
    from: nf('Map.from', (a) => new Map(a[0])),
    of: nf('Map.of', (a) => new Map(a[0])),
    fromEntries: nf('Map.fromEntries', (a) => new Map(I.iterItems(a[0]).map((e: DInstance) => [e.fields.get('key'), e.fields.get('value')]))),
    unmodifiable: nf('Map.unmodifiable', (a) => freeze(new Map(a[0]))),
  }, () => new Map()), true);
  g.declare('Set', new NType('Set', { from: nf('Set.from', (a) => new Set(I.iterItems(a[0]))), of: nf('Set.of', (a) => new Set(I.iterItems(a[0]))) }, () => new Set()), true);
  g.declare('Iterable', new NType('Iterable', { generate: nf('Iterable.generate', (a) => { const out = []; for (let i = 0; i < a[0]; i++) out.push(a[1] ? I.callValue(a[1], [i]) : i); return new DIter(out); }) }), true);
  const duration = (n: Record<string, any>) => new NObj('Duration', { ms: (numVal(n.days ?? 0) * 86400000) + (numVal(n.hours ?? 0) * 3600000) + numVal(n.minutes ?? 0) * 60000 + numVal(n.seconds ?? 0) * 1000 + numVal(n.milliseconds ?? 0) + numVal(n.microseconds ?? 0) / 1000 });
  g.declare('Duration', new NType('Duration', { zero: new NObj('Duration', { ms: 0 }) }, (_a, n) => duration(n)), true);
  g.declare('Future', new NType('Future', {
    value: nf('Future.value', (a) => new DFuture(a[0] ?? null)),
    error: nf('Future.error', (a) => new DFuture(null, a[0], true)),
    delayed: nf('Future.delayed', (a) => { I.virtualTimeMs += a[0]?.props?.ms ?? 0; if (!a[1]) return new DFuture(null); try { return new DFuture(I.callValue(a[1], [])); } catch (e: any) { if (e?.constructor?.name === 'DartThrow') return new DFuture(null, e.value, true); throw e; } }),
    wait: nf('Future.wait', (a) => { const items = I.iterItems(a[0]); const bad = items.find((f: any) => f instanceof DFuture && f.failed); if (bad) return new DFuture(null, bad.error, true); return new DFuture(items.map((f: any) => (f instanceof DFuture ? f.value : f))); }),
  }, (a) => { try { return new DFuture(I.callValue(a[0], [])); } catch (e: any) { if (e?.constructor?.name === 'DartThrow') return new DFuture(null, e.value, true); throw e; } }), true);
  g.declare('StringBuffer', new NType('StringBuffer', {}, (a) => {
    const sb = new NObj('StringBuffer', { s: a[0] !== undefined ? I.str(a[0]) : '' });
    return sb;
  }), true);

  if (I.imports.has('dart:math')) {
    const m = (name: string, f: (...x: number[]) => number, dbl = true) => g.declare(name, nf(name, (a) => { a.forEach((x) => { if (!isNum(x)) I.cerr(`${name}() expects numbers, got '${typeName(x)}'.`); }); const r = f(...a.map(numVal)); return dbl ? new DDouble(r) : r; }), true);
    m('sqrt', Math.sqrt); m('sin', Math.sin); m('cos', Math.cos); m('tan', Math.tan); m('atan2', Math.atan2); m('log', Math.log); m('exp', Math.exp);
    g.declare('pow', nf('pow', (a) => { const r = Math.pow(numVal(a[0]), numVal(a[1])); return typeof a[0] === 'number' && typeof a[1] === 'number' && a[1] >= 0 ? r : new DDouble(r); }), true);
    g.declare('max', nf('max', (a) => (numVal(a[0]) >= numVal(a[1]) ? a[0] : a[1])), true);
    g.declare('min', nf('min', (a) => (numVal(a[0]) <= numVal(a[1]) ? a[0] : a[1])), true);
    g.declare('pi', new DDouble(Math.PI), true); g.declare('e', new DDouble(Math.E), true);
    g.declare('Random', new NType('Random', {}, (a) => {
      let seed = (a[0] ?? 42) >>> 0;
      const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      return new NObj('Random', { nextInt: nf('nextInt', (x) => Math.floor(next() * x[0])), nextDouble: nf('nextDouble', () => new DDouble(next())), nextBool: nf('nextBool', () => next() < 0.5) });
    }), true);
  }
  if (I.imports.has('dart:convert')) {
    const enc = (v: any): any => {
      if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') return v;
      if (v instanceof DDouble) return v.v;
      if (Array.isArray(v)) return v.map(enc);
      if (v instanceof Map) { const o: any = {}; for (const [k, x] of v) { if (typeof k !== 'string') I.throwDart('UnsupportedError', 'Converting object to an encodable object failed: map keys must be Strings'); o[k] = enc(x); } return o; }
      if (v instanceof DInstance) { const tj = I.findMethod(v.cls, 'toJson'); if (tj) return enc(I.callValue(I.getMember(v, 'toJson'), [])); }
      I.throwDart('UnsupportedError', `Converting object to an encodable object failed: Instance of '${typeName(v)}'`);
    };
    const dec = (v: any): any => {
      if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
      if (typeof v === 'number') return v;
      if (Array.isArray(v)) return v.map(dec);
      const m = new Map(); for (const k of Object.keys(v)) m.set(k, dec(v[k])); return m;
    };
    g.declare('jsonEncode', nf('jsonEncode', (a) => JSON.stringify(enc(a[0]))), true);
    g.declare('jsonDecode', nf('jsonDecode', (a) => {
      if (typeof a[0] !== 'string') I.cerr('jsonDecode expects a String.');
      let raw: any; try { raw = JSON.parse(a[0], (_k, val) => val); } catch (e: any) { I.throwDart('FormatException', `Unexpected character in JSON: ${e.message}`); }
      // preserve doubles written with a decimal point
      return markDoubles(dec(raw), a[0]);
    }), true);
  }
}

function markDoubles(v: any, src: string): any {
  if (!/\d\.\d/.test(src)) return v;
  const doubles = new Set((src.match(/-?\d+\.\d+(?:[eE][+-]?\d+)?/g) || []).map(Number));
  const walk = (x: any): any => {
    if (typeof x === 'number' && doubles.has(x)) return new DDouble(x);
    if (Array.isArray(x)) return x.map(walk);
    if (x instanceof Map) { for (const [k, y] of x) x.set(k, walk(y)); return x; }
    return x;
  };
  return walk(v);
}

function guardMut(I: Interpreter, o: any, op: string) {
  if (unmodifiable.has(o)) I.throwDart('UnsupportedError', `Cannot ${op} an unmodifiable list (it was created with const or List.unmodifiable).`);
}

function iterMethods(I: Interpreter, items: any[], name: string, src: any): any {
  const nf = (fn: (a: any[], n: Record<string, any>) => any) => new NativeFn(name, fn);
  const call = (f: any, ...a: any[]) => I.callValue(f, a);
  const bool = (v: any, what: string) => { if (typeof v !== 'boolean') I.cerr(`The ${what} callback must return a bool (got '${typeName(v)}').`); return v; };
  switch (name) {
    case 'length': return items.length;
    case 'isEmpty': return items.length === 0;
    case 'isNotEmpty': return items.length > 0;
    case 'first': if (!items.length) I.throwDart('StateError', 'No element'); return items[0];
    case 'last': if (!items.length) I.throwDart('StateError', 'No element'); return items[items.length - 1];
    case 'single': if (items.length !== 1) I.throwDart('StateError', items.length ? 'Too many elements' : 'No element'); return items[0];
    case 'map': return nf((a) => new DIter(items.map((x) => call(a[0], x))));
    case 'where': return nf((a) => new DIter(items.filter((x) => bool(call(a[0], x), 'where'))));
    case 'whereType': return nf(() => new DIter(items));
    case 'expand': return nf((a) => new DIter(items.flatMap((x) => I.iterItems(call(a[0], x)))));
    case 'forEach': return nf((a) => { items.forEach((x) => call(a[0], x)); return null; });
    case 'reduce': return nf((a) => { if (!items.length) I.throwDart('StateError', 'No element'); return items.slice(1).reduce((acc, x) => call(a[0], acc, x), items[0]); });
    case 'fold': return nf((a) => items.reduce((acc, x) => call(a[1], acc, x), a[0]));
    case 'join': return nf((a) => items.map((x) => I.str(x)).join(a[0] ?? ''));
    case 'toList': return nf(() => [...items]);
    case 'toSet': return nf(() => { const s = new Set(); for (const x of items) if (![...s].some((y) => I.eq(x, y))) s.add(x); return s; });
    case 'any': return nf((a) => items.some((x) => bool(call(a[0], x), 'any')));
    case 'every': return nf((a) => items.every((x) => bool(call(a[0], x), 'every')));
    case 'contains': return nf((a) => items.some((x) => I.eq(x, a[0])));
    case 'take': return nf((a) => new DIter(items.slice(0, a[0])));
    case 'skip': return nf((a) => new DIter(items.slice(a[0])));
    case 'takeWhile': return nf((a) => { const out = []; for (const x of items) { if (!call(a[0], x)) break; out.push(x); } return new DIter(out); });
    case 'skipWhile': return nf((a) => { let i = 0; while (i < items.length && call(a[0], items[i])) i++; return new DIter(items.slice(i)); });
    case 'elementAt': return nf((a) => { if (a[0] < 0 || a[0] >= items.length) I.throwDart('RangeError', `RangeError (index): Invalid value: ${a[0]}`); return items[a[0]]; });
    case 'firstWhere': return nf((a, n) => { const r = items.find((x) => bool(call(a[0], x), 'firstWhere')); if (r !== undefined) return r; if (n.orElse) return call(n.orElse); I.throwDart('StateError', 'No element'); });
    case 'lastWhere': return nf((a, n) => { const r = [...items].reverse().find((x) => call(a[0], x)); if (r !== undefined) return r; if (n.orElse) return call(n.orElse); I.throwDart('StateError', 'No element'); });
    case 'followedBy': return nf((a) => new DIter([...items, ...I.iterItems(a[0])]));
    case 'hashCode': return 0;
    case 'toString': return nf(() => I.str(src));
    case 'iterator': return undefined;
  }
  return undefined;
}

export function builtinMember(I: Interpreter, o: any, name: string, node?: Node): any {
  const nf = (fn: (a: any[], n: Record<string, any>) => any) => new NativeFn(name, fn);
  if (typeof o === 'string') {
    switch (name) {
      case 'length': return o.length;
      case 'isEmpty': return o.length === 0;
      case 'isNotEmpty': return o.length > 0;
      case 'toUpperCase': return nf(() => o.toUpperCase());
      case 'toLowerCase': return nf(() => o.toLowerCase());
      case 'trim': return nf(() => o.trim());
      case 'trimLeft': return nf(() => o.trimStart());
      case 'trimRight': return nf(() => o.trimEnd());
      case 'contains': return nf((a) => o.includes(a[0]));
      case 'startsWith': return nf((a) => o.startsWith(a[0]));
      case 'endsWith': return nf((a) => o.endsWith(a[0]));
      case 'indexOf': return nf((a) => o.indexOf(a[0], a[1] ?? 0));
      case 'lastIndexOf': return nf((a) => o.lastIndexOf(a[0]));
      case 'substring': return nf((a) => { const s = a[0], e = a[1] ?? o.length; if (s < 0 || e > o.length || s > e) I.throwDart('RangeError', `RangeError: Invalid value: Not in inclusive range ${s}..${o.length}: ${e}`); return o.substring(s, e); });
      case 'split': return nf((a) => o.split(a[0]));
      case 'replaceAll': return nf((a) => o.split(a[0]).join(a[1]));
      case 'replaceFirst': return nf((a) => o.replace(a[0], a[1]));
      case 'padLeft': return nf((a) => o.padStart(a[0], a[1] ?? ' '));
      case 'padRight': return nf((a) => o.padEnd(a[0], a[1] ?? ' '));
      case 'codeUnitAt': return nf((a) => o.charCodeAt(a[0]));
      case 'codeUnits': return [...o].map((c) => c.charCodeAt(0));
      case 'compareTo': return nf((a) => (o < a[0] ? -1 : o > a[0] ? 1 : 0));
      case 'toString': return nf(() => o);
      case 'hashCode': return [...o].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
      case 'runtimeType': return new NType('String');
    }
    return undefined;
  }
  if (isNum(o)) {
    const x = numVal(o), dbl = o instanceof DDouble;
    switch (name) {
      case 'abs': return nf(() => toNum(Math.abs(x), dbl));
      case 'round': return nf(() => dartRound(x));
      case 'floor': return nf(() => Math.floor(x));
      case 'ceil': return nf(() => Math.ceil(x));
      case 'truncate': return nf(() => Math.trunc(x));
      case 'toInt': return nf(() => Math.trunc(x));
      case 'toDouble': return nf(() => new DDouble(x));
      case 'roundToDouble': return nf(() => new DDouble(dartRound(x)));
      case 'toString': return nf(() => I.str(o));
      case 'toStringAsFixed': return nf((a) => x.toFixed(a[0]));
      case 'isEven': if (dbl) break; return x % 2 === 0;
      case 'isOdd': if (dbl) break; return Math.abs(x % 2) === 1;
      case 'isNegative': return x < 0;
      case 'isNaN': return Number.isNaN(x);
      case 'isInfinite': return !Number.isFinite(x) && !Number.isNaN(x);
      case 'isFinite': return Number.isFinite(x);
      case 'sign': return toNum(Math.sign(x), dbl);
      case 'clamp': return nf((a) => { const lo = numVal(a[0]), hi = numVal(a[1]); if (lo > hi) I.throwDart('ArgumentError', `${a[1]} is less than ${a[0]}`); return x < lo ? a[0] : x > hi ? a[1] : o; });
      case 'compareTo': return nf((a) => (x < numVal(a[0]) ? -1 : x > numVal(a[0]) ? 1 : 0));
      case 'remainder': return nf((a) => toNum(x % numVal(a[0]), dbl || a[0] instanceof DDouble));
      case 'hashCode': return Math.floor(x);
      case 'runtimeType': return new NType(dbl ? 'double' : 'int');
    }
    return undefined;
  }
  if (typeof o === 'boolean') { if (name === 'toString') return nf(() => String(o)); if (name === 'hashCode') return o ? 1231 : 1237; return undefined; }
  if (Array.isArray(o)) {
    const mut = (op: string) => guardMut(I, o, op);
    switch (name) {
      case 'add': return nf((a) => { mut('add to'); o.push(a[0]); I.checkSize(o.length, node); return null; });
      case 'addAll': return nf((a) => { mut('add to'); o.push(...I.iterItems(a[0])); I.checkSize(o.length, node); return null; });
      case 'insert': return nf((a) => { mut('insert into'); if (a[0] < 0 || a[0] > o.length) I.throwDart('RangeError', `RangeError: Invalid value: ${a[0]}`); o.splice(a[0], 0, a[1]); return null; });
      case 'remove': return nf((a) => { mut('remove from'); const i = o.findIndex((x) => I.eq(x, a[0])); if (i >= 0) { o.splice(i, 1); return true; } return false; });
      case 'removeAt': return nf((a) => { mut('remove from'); if (a[0] < 0 || a[0] >= o.length) I.throwDart('RangeError', `RangeError (index): Invalid value: ${a[0]}`); return o.splice(a[0], 1)[0]; });
      case 'removeLast': return nf(() => { mut('remove from'); if (!o.length) I.throwDart('RangeError', 'RangeError: The list is empty'); return o.pop(); });
      case 'removeWhere': return nf((a) => { mut('remove from'); const keep = o.filter((x) => !I.callValue(a[0], [x])); o.length = 0; o.push(...keep); return null; });
      case 'retainWhere': return nf((a) => { mut('remove from'); const keep = o.filter((x) => I.callValue(a[0], [x])); o.length = 0; o.push(...keep); return null; });
      case 'clear': return nf(() => { mut('clear'); o.length = 0; return null; });
      case 'indexOf': return nf((a) => o.findIndex((x) => I.eq(x, a[0])));
      case 'indexWhere': return nf((a) => o.findIndex((x) => I.callValue(a[0], [x])));
      case 'sort': return nf((a) => {
        mut('sort');
        const cmp = a[0] ? (x: any, y: any) => { const r = I.callValue(a[0], [x, y]); if (typeof r !== 'number') I.cerr('The sort comparator must return an int.'); return r; }
          : (x: any, y: any) => { if (isNum(x) && isNum(y)) return numVal(x) - numVal(y); if (typeof x === 'string' && typeof y === 'string') return x < y ? -1 : x > y ? 1 : 0; I.throwDart('TypeError', `'${typeName(x)}' is not Comparable — pass a comparator to sort().`); };
        const sorted = [...o].sort(cmp); o.length = 0; o.push(...sorted); return null;
      });
      case 'reversed': return new DIter([...o].reverse());
      case 'sublist': return nf((a) => { const e = a[1] ?? o.length; if (a[0] < 0 || e > o.length || a[0] > e) I.throwDart('RangeError', `RangeError: Invalid value: Not in inclusive range ${a[0]}..${o.length}: ${e}`); return o.slice(a[0], e); });
      case 'asMap': return nf(() => new Map(o.map((x, i) => [i, x])));
      case 'shuffle': return nf(() => null);
      case 'getRange': return nf((a) => new DIter(o.slice(a[0], a[1])));
      case 'runtimeType': return new NType('List<dynamic>');
    }
    return iterMethods(I, o, name, o);
  }
  if (o instanceof DIter) { if (name === 'runtimeType') return new NType('Iterable'); return iterMethods(I, o.items, name, o); }
  if (o instanceof Set) {
    const items = [...o];
    const mut = () => { if (unmodifiable.has(o)) I.throwDart('UnsupportedError', 'Cannot modify an unmodifiable Set'); };
    switch (name) {
      case 'add': return nf((a) => { mut(); if (items.some((x) => I.eq(x, a[0]))) return false; o.add(a[0]); return true; });
      case 'addAll': return nf((a) => { mut(); for (const x of I.iterItems(a[0])) if (![...o].some((y) => I.eq(x, y))) o.add(x); return null; });
      case 'remove': return nf((a) => { mut(); const f = items.find((x) => I.eq(x, a[0])); if (f === undefined) return false; o.delete(f); return true; });
      case 'clear': return nf(() => { mut(); o.clear(); return null; });
      case 'union': return nf((a) => { const s = new Set(o); for (const x of a[0]) if (![...s].some((y) => I.eq(x, y))) s.add(x); return s; });
      case 'intersection': return nf((a) => new Set(items.filter((x) => [...a[0]].some((y: any) => I.eq(x, y)))));
      case 'difference': return nf((a) => new Set(items.filter((x) => ![...a[0]].some((y: any) => I.eq(x, y)))));
      case 'containsAll': return nf((a) => I.iterItems(a[0]).every((x: any) => items.some((y) => I.eq(x, y))));
    }
    return iterMethods(I, items, name, o);
  }
  if (o instanceof Map) {
    const find = (k: any) => { for (const kk of o.keys()) if (I.eq(kk, k)) return { found: true, key: kk }; return { found: false, key: k }; };
    const mut = () => { if (unmodifiable.has(o)) I.throwDart('UnsupportedError', 'Cannot modify unmodifiable map'); };
    const entryCls = I.globals.vars.get('MapEntry')!.v as DClass;
    switch (name) {
      case 'length': return o.size;
      case 'isEmpty': return o.size === 0;
      case 'isNotEmpty': return o.size > 0;
      case 'keys': return new DIter([...o.keys()]);
      case 'values': return new DIter([...o.values()]);
      case 'entries': return new DIter([...o].map(([k, v]) => I.instantiate(entryCls, '', [k, v], {})));
      case 'containsKey': return nf((a) => find(a[0]).found);
      case 'containsValue': return nf((a) => [...o.values()].some((v) => I.eq(v, a[0])));
      case 'remove': return nf((a) => { mut(); const f = find(a[0]); if (!f.found) return null; const v = o.get(f.key); o.delete(f.key); return v; });
      case 'putIfAbsent': return nf((a) => { mut(); const f = find(a[0]); if (f.found) return o.get(f.key); const v = I.callValue(a[1], []); o.set(a[0], v); return v; });
      case 'update': return nf((a, n) => { mut(); const f = find(a[0]); if (f.found) { const v = I.callValue(a[1], [o.get(f.key)]); o.set(f.key, v); return v; } if (n.ifAbsent) { const v = I.callValue(n.ifAbsent, []); o.set(a[0], v); return v; } I.throwDart('ArgumentError', `Key not in map: ${I.str(a[0])}`); });
      case 'forEach': return nf((a) => { for (const [k, v] of [...o]) I.callValue(a[0], [k, v]); return null; });
      case 'addAll': return nf((a) => { mut(); for (const [k, v] of a[0]) o.set(find(k).key, v); return null; });
      case 'clear': return nf(() => { mut(); o.clear(); return null; });
      case 'map': return nf((a) => { const m = new Map(); for (const [k, v] of o) { const e = I.callValue(a[0], [k, v]); if (!(e instanceof DInstance) || e.cls.name !== 'MapEntry') I.cerr('Map.map must return a MapEntry.'); m.set(e.fields.get('key'), e.fields.get('value')); } return m; });
      case 'removeWhere': return nf((a) => { mut(); for (const [k, v] of [...o]) if (I.callValue(a[0], [k, v])) o.delete(k); return null; });
      case 'toString': return nf(() => I.str(o));
      case 'runtimeType': return new NType('Map');
    }
    return undefined;
  }
  if (o instanceof DEnumValue) {
    if (name === 'name') return o.name;
    if (name === 'index') return o.index;
    if (name === 'toString') return nf(() => `${o.enumName}.${o.name}`);
    if (name === 'hashCode') return o.index;
    return undefined;
  }
  if (o instanceof DFuture) {
    switch (name) {
      case 'then': return nf((a, n) => { o.handled = true; if (o.failed) { if (n.onError) return new DFuture(I.callValue(n.onError, [o.error])); return o; } const r = I.callValue(a[0], [o.value]); return r instanceof DFuture ? r : new DFuture(r); });
      case 'catchError': return nf((a) => { o.handled = true; if (!o.failed) return o; return new DFuture(I.callValue(a[0], [o.error])); });
      case 'whenComplete': return nf((a) => { I.callValue(a[0], []); return o; });
      case 'timeout': return nf(() => o);
    }
    return undefined;
  }
  if (o instanceof NType) {
    if (name in o.statics) return o.statics[name];
    if (name === 'toString') return nf(() => o.name);
    return undefined;
  }
  if (o instanceof NObj) {
    if (o.kind === 'StringBuffer') {
      switch (name) {
        case 'write': return nf((a) => { o.props.s += I.str(a[0]); return null; });
        case 'writeln': return nf((a) => { o.props.s += (a.length ? I.str(a[0]) : '') + '\n'; return null; });
        case 'toString': return nf(() => o.props.s);
        case 'length': return o.props.s.length;
        case 'isEmpty': return o.props.s.length === 0;
        case 'clear': return nf(() => { o.props.s = ''; return null; });
      }
    }
    if (o.kind === 'Duration') {
      const ms = o.props.ms;
      switch (name) {
        case 'inMilliseconds': return Math.trunc(ms);
        case 'inSeconds': return Math.trunc(ms / 1000);
        case 'inMinutes': return Math.trunc(ms / 60000);
        case 'inHours': return Math.trunc(ms / 3600000);
        case 'inDays': return Math.trunc(ms / 86400000);
        case 'inMicroseconds': return Math.trunc(ms * 1000);
        case 'toString': return nf(() => I.str(o));
        case 'compareTo': return nf((a) => Math.sign(ms - a[0].props.ms));
      }
    }
    if (name in o.props && !name.startsWith('__')) { const v = o.props[name]; return typeof v === 'function' ? nf(v) : v; }
    if (name === 'toString') return nf(() => I.str(o));
    if (name === 'runtimeType') return new NType(o.kind);
    return undefined;
  }
  if (o instanceof Closure || o instanceof NativeFn) { if (name === 'call') return o; return undefined; }
  if (o instanceof DInstance) return undefined;
  void fmtDouble;
  return undefined;
}
