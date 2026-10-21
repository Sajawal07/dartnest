import { describe, it, expect } from 'vitest';
import { runProgram } from '../src/engine/runtime';
import { installFlutter } from '../src/engine/flutter';

const out = (src: string) => { const r = runProgram(src, {}, installFlutter); if (!r.ok) throw new Error(r.error!.message); return r.output.join('\n'); };
const err = (src: string, limits = {}) => { const r = runProgram(src, limits, installFlutter); expect(r.ok).toBe(false); return r.error!; };

describe('Stage 1 · variables, literals, functions', () => {
  it('declarations, inference, final/const', () => expect(out("void main() { var a = 1; final b = 2.5; const c = 'x'; a += 2; print('$a $b $c'); }")).toBe('3 2.5 x'));
  it('int/double semantics', () => expect(out('void main() { print(5 / 2); print(4 / 2); print(7 ~/ 2); print(-7 % 3); print(0.1 + 0.2 > 0.3); }')).toBe('2.5\n2.0\n3\n2\ntrue'));
  it('interpolation, raw and multi-line strings', () => expect(out("void main() { var n = 'Dart'; print('${n.length}: $n'); print(r'$raw'); print('''a\nb'''); }")).toBe('4: Dart\n$raw\na\nb'));
  it('positional, optional and named parameters', () => expect(out("String f(String a, [String b = 'B']) => a + b; int h(int a, int b,) => a + b; int g({required int x, int y = 1}) => x * y; void main() { print(f('a')); print(g(x: 3, y: 4)); print(g(x: 2)); print(h(1, 2,)); }")).toBe('aB\n12\n2\n3'));
  it('final cannot be reassigned', () => expect(err("void main() { final x = 1; x = 2; }").message).toMatch(/final/));
});

describe('Stage 2 · collections & conditions', () => {
  it('collection literals, spreads, collection-if/for', () => expect(out('void main() { final a = [1, 2]; final show = true; print([0, ...a, if (show) 9, for (var i in a) i * 10]); print({1, 1, 2}); print({"k": 1}["k"]); }')).toBe('[0, 1, 2, 9, 10, 20]\n{1, 2}\n1'));
  it('functional collection API', () => expect(out('void main() { final xs = [3, 1, 2]; xs.sort(); print(xs); print(xs.where((x) => x > 1).map((x) => x * x).toList()); print(xs.fold(0, (a, b) => a + b)); }')).toBe('[1, 2, 3]\n[4, 9]\n6'));
  it('switch statement and switch expression', () => expect(out("void main() { var d = 6; switch (d) { case 6: case 7: print('weekend'); default: print('weekday'); } print(switch (d) { 1 => 'mon', _ => 'other' }); }")).toBe('weekend\nother'));
  it('loops with break/continue and closure capture per iteration', () => expect(out('void main() { var s = 0; for (var i = 0; i < 10; i++) { if (i == 5) break; if (i.isOdd) continue; s += i; } print(s); final fs = []; for (var i = 0; i < 3; i++) { fs.add(() => i); } print(fs.map((f) => f()).toList()); }')).toBe('6\n[0, 1, 2]'));
  it('rejects non-bool conditions (no truthiness)', () => expect(err("void main() { if ([]) print('x'); }").kind).toBe('compile'));
  it('detects concurrent modification', () => expect(err('void main() { final l = [1, 2, 3]; for (final x in l) { l.add(x); } }').message).toMatch(/Concurrent modification/));
  it('const collections are unmodifiable', () => expect(out("void main() { const l = [1]; try { l.add(2); } catch (e) { print('blocked'); } }")).toBe('blocked'));
});

describe('Stage 3 · null safety & errors', () => {
  it('null-aware operators', () => expect(out("void main() { String? s; print(s?.length); print(s ?? 'none'); s ??= 'set'; print(s!.length); }")).toBe('null\nnone\n3'));
  it('null check failure is reported', () => expect(err('void main() { String? s; print(s!.length); }').message).toMatch(/Null check operator/));
  it('non-nullable typed variable rejects null', () => expect(err('void main() { int x = null; }').message).toMatch(/can't be assigned/));
  it('try/on/catch/finally and rethrow', () => expect(out("void f() { try { throw FormatException('bad'); } catch (e) { rethrow; } } void main() { try { f(); } on FormatException catch (e) { print(e); } finally { print('done'); } }")).toBe('FormatException: bad\ndone'));
  it('type checks, casts and failed casts', () => expect(out("void main() { Object o = 'x'; print(o is String); try { o as int; } catch (e) { print('cast failed'); } }")).toBe('true\ncast failed'));
});

describe('Stage 4 · classes & types', () => {
  it('constructors: initializing formals, named, factory, initializer list, redirecting', () => expect(out("class P { final int x, y; P(this.x, this.y); P.origin() : this(0, 0); factory P.fromList(List<int> l) => P(l[0], l[1]); @override String toString() => '($x, $y)'; } void main() { print(P(1, 2)); print(P.origin()); print(P.fromList([3, 4])); }")).toBe('(1, 2)\n(0, 0)\n(3, 4)'));
  it('inheritance, super calls, abstract classes and polymorphism', () => expect(out("abstract class A { String n(); String d() => 'I am ${n()}'; } class B extends A { @override String n() => 'B'; } class C extends B { @override String n() => 'C' + super.n(); } void main() { for (final a in <A>[B(), C()]) print(a.d()); }")).toBe('I am B\nI am CB'));
  it('abstract classes cannot be instantiated; missing implementations are errors', () => {
    expect(err('abstract class A {} void main() { A(); }').message).toMatch(/Abstract classes can't be instantiated/);
    expect(err('abstract class A { void f(); } class B extends A {} void main() {}').message).toMatch(/Missing concrete implementation/);
  });
  it('getters, setters, statics, operators, mixins, enums, generics', () => expect(out("mixin Hi { String hi() => 'hi'; } class V with Hi { static int made = 0; int _x = 0; V() { made++; } int get x => _x; set x(int v) => _x = v * 2; V operator +(V o) => V()..x = (x + o.x) ~/ 2; } enum E { a, b } T first<T>(List<T> l) => l.first; void main() { final v = V()..x = 2; print(v.x); print((v + v).x); print(V.made); print(v.hi()); print(E.b.index); print(first(['z'])); }")).toBe('4\n8\n2\nhi\n1\nz')); // v and (v + v) → 2 instances
});

describe('Stage 5 · async & libraries', () => {
  it('async/await, Future.wait, error propagation', () => expect(out("Future<int> f(int x) async { await Future.delayed(const Duration(milliseconds: 5)); if (x < 0) throw StateError('neg'); return x * 2; } void main() async { print(await f(2)); print(await Future.wait([f(1), f(3)])); try { await f(-1); } catch (e) { print(e); } }")).toBe('4\n[2, 6]\nBad state: neg'));
  it('await outside async is an error', () => expect(err('void main() { await Future.value(1); }').message).toMatch(/async/));
  it('dart:math and dart:convert', () => expect(out("import 'dart:math';\nimport 'dart:convert';\nvoid main() { print(sqrt(16)); print(max(3, 7)); print(jsonEncode({'a': [1, true]})); print(jsonDecode('{\"x\": 2.5}')['x']); }")).toBe('4.0\n7\n{"a":[1,true]}\n2.5'));
});

describe('Unsupported constructs produce explicit diagnostics', () => {
  const unsupported: [string, string][] = [
    ['extension', 'extension on int { int get twice => this * 2; }\nvoid main() {}'],
    ['typedef', 'typedef F = int Function(int);\nvoid main() {}'],
    ['dart:io import', "import 'dart:io';\nvoid main() {}"],
    ['http import', "import 'package:http/http.dart';\nvoid main() {}"],
    ['async* generator', 'Stream<int> s() async* { yield 1; }\nvoid main() {}'],
    ['await for', 'void main() async { await for (final x in s) {} }'],
    ['enhanced enum', 'enum E { a(1); }\nvoid main() {}'],
  ];
  for (const [name, src] of unsupported) it(name, () => { const e = err(src); expect(e.kind).toBe('unsupported'); expect(e.message).toMatch(/Unsupported offline/); expect(e.line).toBeGreaterThan(0); });
  it('syntax errors carry line and column', () => { const e = err('void main() {\n  print("x")\n}'); expect(e.kind).toBe('syntax'); expect(e.line).toBe(3); });
  it('missing Flutter import is explained', () => expect(err("void main() { runApp(Text('x')); }").message).toMatch(/flutter\/material\.dart/));
});

describe('Sandbox limits, isolation and safety', () => {
  it('stops infinite loops (instruction limit)', () => expect(err('void main() { while (true) {} }', { maxSteps: 100_000 }).kind).toBe('limit'));
  it('stops runaway recursion (depth limit)', () => expect(err('int f(int n) => f(n + 1); void main() { f(0); }').message).toMatch(/Stack Overflow/));
  it('enforces the time limit', () => expect(err('void main() { var i = 0; while (true) { i++; } }', { maxSteps: 1e12, maxMs: 200 }).message).toMatch(/time limit/));
  it('enforces collection-size limits', () => expect(err('void main() { List.filled(5000000, 0); }').kind).toBe('limit'));
  it('enforces output limits', () => expect(err('void main() { for (var i = 0; i < 5000; i++) print(i); }').message).toMatch(/Output limit/));
  it('host globals, storage, network and DOM are unreachable', () => {
    for (const name of ['window', 'globalThis', 'localStorage', 'fetch', 'document', 'process', 'eval', 'XMLHttpRequest']) {
      expect(err(`void main() { print(${name}); }`).message).toMatch(/Undefined name/);
    }
  });
  it('errors are isolated per run (a failing run does not affect the next)', () => {
    err('var g = 1; void main() { g = 2; throw Exception("x"); }');
    expect(out('var g = 1; void main() { print(g); }')).toBe('1');
  });
  it('uncaught exceptions are reported, not thrown to the host', () => { const r = runProgram("void main() { throw StateError('boom'); }"); expect(r.ok).toBe(false); expect(r.error!.message).toMatch(/Bad state: boom/); });
});
