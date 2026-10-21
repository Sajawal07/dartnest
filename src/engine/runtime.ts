// Tree-walking interpreter for the documented Dart subset.
// Sandboxed: user code can only reach allow-listed natives defined in corelib/flutter.
import { parseProgram, parseExpression, Node, TypeRef, Param } from './parser';
import { DartSyntaxError } from './lexer';
import {
  DDouble, DIter, NativeFn, NType, Slot, UNINIT, SHORT, Env, DClass, DInstance, DEnumValue, DEnum, DFuture, NObj, Closure,
  BreakSig, ContinueSig, ReturnSig, DartThrow, EngineError, isNum, numVal, typeName, toStr, dartEquals, freeze, unmodifiable,
} from './values';
import { installCore, builtinMember, PRELUDE } from './corelib';

export interface RunLimits { maxSteps: number; maxMs: number; maxDepth: number; maxCollection: number; maxOutput: number }
export const DEFAULT_LIMITS: RunLimits = { maxSteps: 2_000_000, maxMs: 2500, maxDepth: 300, maxCollection: 100_000, maxOutput: 2000 };

let preludeAst: Node | null = null;
const FLUTTER_HINT = new Set(['Text', 'Container', 'Column', 'Row', 'Scaffold', 'MaterialApp', 'runApp', 'Center', 'Padding', 'Icon', 'Icons', 'Colors', 'StatelessWidget', 'StatefulWidget', 'State', 'Widget', 'BuildContext', 'EdgeInsets', 'SizedBox', 'ElevatedButton', 'AppBar', 'ListView']);

export class Interpreter {
  globals = new Env(null);
  output: string[] = [];
  steps = 0; depth = 0; deadline = 0;
  limits: RunLimits;
  imports = new Set<string>();
  program: Node;
  rootWidget: any = null;
  dirty = false;
  onDirty: (() => void) | null = null;
  routeStack: any[] = [];
  namedRoutes: Map<string, any> | null = null;
  excStack: DartThrow[] = [];
  virtualTimeMs = 0;
  hooks: Record<string, any> = {};
  states = new Map<string, DInstance>();
  constCache = new WeakMap<object, any>();

  constructor(program: Node | string, limits: Partial<RunLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.program = typeof program === 'string' ? parseProgram(program) : program;
    for (const im of this.program.imports) this.imports.add(im);
  }

  // ---------- setup ----------
  load() {
    this.resetBudget();
    if (!preludeAst) preludeAst = parseProgram(PRELUDE);
    installCore(this);
    this.declareAll(preludeAst.decls, true);
    if (this.imports.has('package:flutter/material.dart') || this.imports.has('package:flutter/widgets.dart')) this.hooks.installFlutter?.(this);
    this.declareAll(this.program.decls, false);
  }
  resetBudget() { this.steps = 0; this.depth = 0; this.deadline = Date.now() + this.limits.maxMs; }

  declareAll(decls: Node[], prelude: boolean) {
    const classes: DClass[] = [];
    for (const d of decls) {
      if (d.k === 'class') {
        if (this.globals.vars.has(d.name) && !prelude) this.cerr(`The name '${d.name}' is already defined.`, d);
        const c = new DClass(d.name, d, this.globals);
        c.isAbstract = d.isAbstract; c.isPrelude = prelude; c.interfaces = d.interfaces; c.mixins = d.mixins;
        for (const f of d.fields) for (const v of f.vars) { c.fieldTypes.set(v.name, f.type); if (f.isFinal || f.isConst) c.finals.add(v.name); }
        c.fieldDecls = [...d.fields];
        for (const m of d.methods) c.methods.set(m.name, m);
        for (const g of d.getters) c.getters.set(g.name, g);
        for (const s of d.setters) c.setters.set(s.name, s);
        for (const k of d.ctors) c.ctors.set(k.name, k);
        for (const s of d.statics) { if (s.k === 'fn') (s.isGetter ? c.staticGetters : c.staticMethods).set(s.name, s); }
        this.globals.declare(d.name, c, true);
        classes.push(c);
      } else if (d.k === 'enum') {
        this.globals.declare(d.name, new DEnum(d.name, d.values), true);
      } else if (d.k === 'fn') {
        if (this.globals.vars.has(d.name) && !prelude && !(this.globals.vars.get(d.name)!.v instanceof NativeFn)) this.cerr(`The name '${d.name}' is already defined.`, d);
        if (d.isGetter) { const self = this; const decl = d; this.globals.declare(d.name, new NativeFn('getter', () => self.callClosure(new Closure(decl, self.globals), [], {})), true); }
        else this.globals.declare(d.name, new Closure(d, this.globals), true);
      }
    }
    for (const c of classes) {
      const d = c.decl;
      if (d.superName) {
        const s = this.globals.vars.get(d.superName)?.v;
        if (!(s instanceof DClass)) this.cerr(`Classes can only extend other classes. '${d.superName}' is not a known class.`, d);
        c.superclass = s;
      }
      for (const m of d.mixins) {
        const mx = this.globals.vars.get(m)?.v;
        if (!(mx instanceof DClass)) this.cerr(`'${m}' is not a known mixin.`, d);
        for (const [k, v] of mx.methods) if (!c.methods.has(k)) c.methods.set(k, v);
        for (const [k, v] of mx.getters) if (!c.getters.has(k)) c.getters.set(k, v);
        for (const f of mx.fieldDecls) { c.fieldDecls.push(f); for (const v of f.vars) c.fieldTypes.set(v.name, f.type); }
      }
      for (const i of d.interfaces) if (!(this.globals.vars.get(i)?.v instanceof DClass)) this.cerr(`'${i}' is not a known class or interface.`, d);
    }
    for (const c of classes) {
      // static fields
      const senv = new Env(this.globals, null, c);
      for (const s of c.decl.statics) if (s.k === 'var') for (const v of s.vars) c.statics.set(v.name, new Slot(v.name, v.init ? this.eval(v.init, senv) : null, s.isFinal || s.isConst, s.type));
      // concrete class must implement abstract members
      if (!c.isAbstract && !prelude) {
        for (const anc of c.chain().slice(1).concat(c.interfaces.map((n) => this.globals.vars.get(n)!.v as DClass))) {
          for (const [name, m] of anc.methods) {
            if (m.body === null || (c.interfaces.includes(anc.name))) {
              if (name === 'toString' || name.startsWith('operator')) continue;
              const impl = c.chain().find((k) => k.methods.get(name)?.body);
              if (!impl && !(anc.isPrelude && anc.name === 'State')) this.cerr(`Missing concrete implementation of '${anc.name}.${name}' in class '${c.name}'.`, c.decl);
            }
          }
        }
      }
    }
    for (const d of decls) {
      if (d.k === 'var') this.execVar(d, this.globals);
    }
  }

  // ---------- running ----------
  runMain() {
    const m = this.globals.vars.get('main');
    if (!m || !(m.v instanceof Closure)) throw new EngineError("No 'main()' function found. Every Dart program starts at void main() { ... }.", 1, 1, 'compile');
    this.resetBudget();
    return this.callValue(m.v, [], {});
  }
  evalSource(src: string): any {
    const e = parseExpression(src);
    this.resetBudget();
    return this.eval(e, this.globals);
  }
  callValue(fn: any, args: any[], named: Record<string, any> = {}, node?: Node): any {
    if (fn instanceof Closure) return this.callClosure(fn, args, named, node);
    if (fn instanceof NativeFn) return fn.fn(args, named);
    if (fn instanceof DClass) return this.instantiate(fn, '', args, named, node);
    if (fn instanceof NType && fn.call) return fn.call(args, named);
    if (fn instanceof DInstance) { const m = this.findMethod(fn.cls, 'call'); if (m) return this.callClosure(new Closure(m.decl, this.methodEnv(fn, m.cls), fn, m.cls), args, named, node); }
    if (fn === null) this.throwDart('NoSuchMethodError', "Tried to call a null value. Check that the callback/function was assigned.");
    this.rerr(`'${typeName(fn)}' is not a function and can't be called.`, node);
  }
  print(s: string) {
    if (this.output.length >= this.limits.maxOutput) throw new EngineError(`Output limit reached (${this.limits.maxOutput} lines).`, 0, 0, 'limit');
    this.output.push(s);
  }

  // ---------- errors ----------
  cerr(msg: string, node?: Node): never { throw new EngineError(msg, node?.line ?? 0, node?.col ?? 0, 'compile'); }
  rerr(msg: string, node?: Node): never { throw new EngineError(msg, node?.line ?? 0, node?.col ?? 0, 'runtime'); }
  throwDart(cls: string, msg: string): never {
    const c = this.globals.vars.get(cls)?.v as DClass;
    const inst = this.instantiate(c, '', [msg], {});
    throw new DartThrow(inst, '#0 ' + cls);
  }
  tick(node: Node) {
    if (++this.steps > this.limits.maxSteps) throw new EngineError(`Execution stopped after ${this.limits.maxSteps.toLocaleString()} steps — possible infinite loop or very expensive code.`, node?.line, node?.col, 'limit');
    if ((this.steps & 4095) === 0 && Date.now() > this.deadline) throw new EngineError(`Execution stopped: time limit of ${this.limits.maxMs} ms exceeded.`, node?.line, node?.col, 'limit');
  }
  checkSize(n: number, node?: Node) { if (n > this.limits.maxCollection) throw new EngineError(`Collection size limit (${this.limits.maxCollection}) exceeded.`, node?.line, node?.col, 'limit'); }

  // ---------- types ----------
  typeMatches(v: any, t: TypeRef, typeParams?: string[]): boolean {
    if (v === null || v === undefined) return t.nullable || ['dynamic', 'Null', 'void', 'var'].includes(t.name) || (typeParams?.includes(t.name) ?? false) || /^[A-Z]$/.test(t.name);
    switch (t.name) {
      case 'dynamic': case 'Object': case 'void': case 'var': return true;
      case 'int': return typeof v === 'number';
      case 'double': return v instanceof DDouble;
      case 'num': return isNum(v);
      case 'String': return typeof v === 'string';
      case 'bool': return typeof v === 'boolean';
      case 'List': return Array.isArray(v) && this.elemsMatch(v, t.args[0]);
      case 'Map': return v instanceof Map && (!t.args.length || ([...v].every(([k, x]) => this.typeMatches(k, t.args[0]) && this.typeMatches(x, t.args[1]))));
      case 'Set': return v instanceof Set;
      case 'Iterable': return Array.isArray(v) || v instanceof DIter || v instanceof Set;
      case 'Function': return v instanceof Closure || v instanceof NativeFn || v instanceof DClass;
      case 'Future': case 'FutureOr': return v instanceof DFuture || t.name === 'FutureOr';
      case 'Null': return false;
      case 'Widget': return this.isWidget(v);
    }
    if (typeParams?.includes(t.name) || /^[A-Z]$/.test(t.name)) return true;
    const g = this.globals.vars.get(t.name)?.v;
    if (g instanceof DClass) return (v instanceof DInstance && v.cls.isSubOf(t.name)) || (v instanceof NObj && ['Exception', 'Widget'].includes(t.name) && v.isWidget);
    if (g instanceof DEnum) return v instanceof DEnumValue && v.enumName === t.name;
    if (v instanceof NObj) return v.kind === t.name || (t.name === 'Color' && v.kind === 'MaterialColor') || !g;
    return !g; // unknown external types are not checked
  }
  elemsMatch(v: any[], t?: TypeRef): boolean {
    if (!t || ['dynamic', 'Object', 'Widget'].includes(t.name) || v.length > 200) return true;
    return v.every((x) => this.typeMatches(x, t));
  }
  isWidget(v: any): boolean { return (v instanceof NObj && v.isWidget) || (v instanceof DInstance && v.cls.isSubOf('Widget')); }
  coerce(v: any, t: TypeRef | null | undefined, what: string, node?: Node, typeParams?: string[]): any {
    if (!t || v === UNINIT) return v;
    if (t.name === 'double' && typeof v === 'number') return new DDouble(v);
    if (t.name === 'List' && Array.isArray(v) && t.args[0]?.name === 'double') { for (let i = 0; i < v.length; i++) if (typeof v[i] === 'number') v[i] = new DDouble(v[i]); }
    if (!this.typeMatches(v, t, typeParams)) {
      const tn = t.name + (t.args.length ? '<' + t.args.map((a) => a.name + (a.nullable ? '?' : '')).join(', ') + '>' : '') + (t.nullable ? '?' : '');
      this.cerr(`A value of type '${typeName(v)}' can't be assigned to ${what} of type '${tn}'.${v === null ? " Use a nullable type ('" + tn + "?') if null is allowed." : ''}`, node);
    }
    return v;
  }

  // ---------- environments ----------
  lookup(env: Env, name: string): { get(): any; set(v: any): void } | null {
    for (let e: Env | null = env; e; e = e.parent) {
      const s = e.vars.get(name);
      if (s) return {
        get: () => s.v,
        set: (v: any) => { if (s.final && s.v !== UNINIT) this.cerr(`Can't assign to the final variable '${name}'.`); s.v = this.coerce(v, s.type, `variable '${name}'`); },
      };
      if (e.inst && this.hasMember(e.inst, name)) {
        const inst = e.inst;
        return { get: () => this.getMember(inst, name), set: (v: any) => this.setMember(inst, name, v) };
      }
      if (e.cls) {
        for (const c of e.cls.chain()) {
          const st = c.statics.get(name);
          if (st) return { get: () => st.v, set: (v: any) => { if (st.final) this.cerr(`Can't assign to the final static '${name}'.`); st.v = v; } };
          const sm = c.staticMethods.get(name);
          if (sm) return { get: () => new Closure(sm, this.globals, null, c), set: () => this.cerr(`Can't assign to a method.`) };
        }
      }
    }
    return null;
  }
  hasMember(inst: DInstance, name: string): boolean {
    if (inst.fields.has(name)) return true;
    for (const c of inst.cls.chain()) if (c.getters.has(name) || c.methods.has(name) || c.setters.has(name)) return true;
    return false;
  }
  findMethod(cls: DClass, name: string, from?: DClass | null): { decl: Node; cls: DClass } | null {
    for (const c of (from ?? cls).chain()) { const m = c.methods.get(name); if (m && m.body !== null) return { decl: m, cls: c }; }
    return null;
  }
  methodEnv(inst: DInstance, cls: DClass): Env { const e = new Env(cls.defEnv, inst, cls); e.defCls = cls; return e; }
  thisOf(env: Env): DInstance | null { for (let e: Env | null = env; e; e = e.parent) if (e.inst) return e.inst; return null; }
  defClsOf(env: Env): DClass | null { for (let e: Env | null = env; e; e = e.parent) if (e.defCls) return e.defCls; return null; }
  instanceToString(i: DInstance): string | null {
    const m = this.findMethod(i.cls, 'toString');
    if (!m) return null;
    return toStr(this.callClosure(new Closure(m.decl, this.methodEnv(i, m.cls), i, m.cls), [], {}), this);
  }
  instanceEquals(a: DInstance, b: any): boolean | null {
    const m = this.findMethod(a.cls, 'operator==');
    if (!m) return null;
    return this.callClosure(new Closure(m.decl, this.methodEnv(a, m.cls), a, m.cls), [b], {}) === true;
  }
  str(v: any) { return toStr(v, this); }
  eq(a: any, b: any) { return dartEquals(a, b, this); }

  // ---------- members ----------
  getMember(obj: any, name: string, node?: Node): any {
    if (obj === null || obj === undefined) this.throwDart('NoSuchMethodError', `The getter '${name}' was called on null. Use '?.' or check for null first.`);
    if (obj instanceof DInstance) {
      if (obj.fields.has(name)) { const v = obj.fields.get(name); if (v === UNINIT) this.throwDart('StateError', `LateInitializationError: Field '${name}' has not been initialized.`); return v; }
      for (const c of obj.cls.chain()) {
        const g = c.getters.get(name);
        if (g) return this.callClosure(new Closure(g, this.methodEnv(obj, c), obj, c), [], {});
        const m = c.methods.get(name);
        if (m && m.body !== null) return new Closure(m, this.methodEnv(obj, c), obj, c);
      }
      if (name === 'runtimeType') return new NType(obj.cls.name);
      if (name === 'hashCode') return obj.id;
      if (name === 'toString') return new NativeFn('toString', () => this.str(obj));
      this.rerr(`The getter '${name}' isn't defined for the class '${obj.cls.name}'.`, node);
    }
    if (obj instanceof DClass) {
      for (const c of obj.chain()) {
        const st = c.statics.get(name); if (st) return st.v;
        const sm = c.staticMethods.get(name); if (sm) return new Closure(sm, this.globals, null, c);
        const sg = c.staticGetters.get(name); if (sg) return this.callClosure(new Closure(sg, new Env(this.globals, null, c)), [], {});
      }
      if (obj.ctors.has(name)) return new NativeFn(`${obj.name}.${name}`, (a, n) => this.instantiate(obj, name, a, n, node));
      this.rerr(`Class '${obj.name}' has no static member or named constructor '${name}'.`, node);
    }
    if (obj instanceof DEnum) {
      if (name === 'values') return freeze([...obj.values]);
      const v = obj.values.find((x) => x.name === name); if (v) return v;
      this.rerr(`There's no constant named '${name}' in '${obj.name}'.`, node);
    }
    const r = builtinMember(this, obj, name, node);
    if (r !== undefined) return r;
    this.rerr(`The getter/method '${name}' isn't defined for the type '${typeName(obj)}'.`, node);
  }
  setMember(obj: any, name: string, v: any, node?: Node) {
    if (obj === null) this.throwDart('NoSuchMethodError', `The setter '${name}=' was called on null.`);
    if (obj instanceof DInstance) {
      for (const c of obj.cls.chain()) {
        const s = c.setters.get(name);
        if (s) { this.callClosure(new Closure(s, this.methodEnv(obj, c), obj, c), [v], {}); return; }
      }
      if (obj.fields.has(name)) {
        const cls = obj.cls.chain().find((c) => c.fieldTypes.has(name));
        if (cls?.finals.has(name) && !obj.constructing && obj.fields.get(name) !== UNINIT) this.cerr(`'${name}' can't be used as a setter because it's final.`, node);
        obj.fields.set(name, this.coerce(v, cls?.fieldTypes.get(name), `field '${name}'`, node));
        return;
      }
      this.rerr(`The setter '${name}' isn't defined for the class '${obj.cls.name}'.`, node);
    }
    if (obj instanceof DClass) { for (const c of obj.chain()) { const st = c.statics.get(name); if (st) { if (st.final) this.cerr(`Can't assign to the final static '${name}'.`, node); st.v = v; return; } } }
    if (obj instanceof NObj && obj.props.__settable?.includes(name)) { obj.props[name] = v; obj.props.__onSet?.(name, v); return; }
    this.rerr(`The setter '${name}' isn't defined for the type '${typeName(obj)}'.`, node);
  }

  // ---------- classes ----------
  instantiate(cls: DClass, ctorName: string, args: any[], named: Record<string, any>, node?: Node): any {
    const ctor = cls.ctors.get(ctorName);
    if (ctorName && !ctor) this.rerr(`The class '${cls.name}' doesn't have a constructor named '${ctorName}'.`, node);
    if (ctor?.factory) {
      const env = new Env(cls.defEnv, null, cls);
      return this.callClosure(new Closure({ params: ctor.params, body: ctor.body, name: `${cls.name}${ctorName ? '.' + ctorName : ''}` }, env), args, named, node);
    }
    if (cls.isAbstract && !(cls.isPrelude && ['Exception'].includes(cls.name))) this.cerr(`Abstract classes can't be instantiated: '${cls.name}'. Create an instance of a concrete subclass instead.`, node);
    const obj = new DInstance(cls);
    for (const c of [...cls.chain()].reverse()) {
      const env = this.methodEnv(obj, c);
      for (const f of c.fieldDecls) for (const v of f.vars) {
        let val = v.init ? this.eval(v.init, env) : (f.type && !f.type.nullable && f.type.name !== 'dynamic') || f.isLate || f.isFinal ? UNINIT : null;
        if (val !== UNINIT) val = this.coerce(val, f.type, `field '${v.name}'`, f);
        obj.fields.set(v.name, val);
      }
    }
    this.depth++;
    if (this.depth > this.limits.maxDepth) throw new EngineError('Stack Overflow: too many nested calls.', node?.line, node?.col, 'limit');
    try { this.runCtor(obj, cls, ctor ?? null, args, named, node); } finally { this.depth--; }
    obj.constructing = false;
    for (const c of cls.chain()) for (const f of c.fieldDecls) if (f.isFinal && !f.isLate) for (const v of f.vars) if (obj.fields.get(v.name) === UNINIT) this.cerr(`Final field '${v.name}' of '${c.name}' was not initialized by the constructor.`, node);
    return obj;
  }
  runCtor(obj: DInstance, cls: DClass, ctor: Node | null, args: any[], named: Record<string, any>, node?: Node) {
    const env = this.methodEnv(obj, cls);
    const sname = `${cls.name}${ctor?.name ? '.' + ctor.name : ''}`;
    if (!ctor) {
      if (args.length || Object.keys(named).length) this.cerr(`Too many arguments: '${sname}' has no explicit constructor, so it takes no arguments.`, node);
      if (cls.superclass) this.runCtor(obj, cls.superclass, cls.superclass.ctors.get('') ?? null, [], {}, node);
      return;
    }
    const superPos: any[] = []; const superNamed: Record<string, any> = Object.create(null);
    this.bindParams(ctor.params, args, named, env, sname, node, (p, v) => {
      if (p.thisField) {
        const fc = cls.chain().find((c) => c.fieldTypes.has(p.name));
        if (!fc) this.cerr(`'${p.name}' isn't a field in the enclosing class '${cls.name}'.`, ctor);
        obj.fields.set(p.name, this.coerce(v, fc.fieldTypes.get(p.name), `field '${p.name}'`, ctor));
        return true;
      }
      if (p.superParam) { if (p.kind === 'named') superNamed[p.name] = v; else superPos.push(v); }
      return false;
    });
    if (ctor.redirect) {
      const r = ctor.redirect;
      const ra = r.args.map((a: Node) => this.eval(a, env)); const rn = this.evalNamed(r.named, env);
      this.runCtor(obj, cls, cls.ctors.get(r.name) ?? null, ra, rn, node);
      return;
    }
    let superCall: Node | null = null;
    for (const init of ctor.inits) {
      if (init.k === 'fieldInit') {
        const fc = cls.chain().find((c) => c.fieldTypes.has(init.name));
        if (!fc) this.cerr(`'${init.name}' isn't a field in the enclosing class.`, ctor);
        obj.fields.set(init.name, this.coerce(this.eval(init.e, env), fc.fieldTypes.get(init.name), `field '${init.name}'`, ctor));
      } else if (init.k === 'assertInit') {
        if (this.eval(init.cond, env) !== true) this.throwDart('AssertionError', init.msg ? this.str(this.eval(init.msg, env)) : 'Assertion failed');
      } else superCall = init;
    }
    if (cls.superclass) {
      const sc = cls.superclass;
      const sa = superCall ? superCall.args.map((a: Node) => this.eval(a, env)) : [];
      const sn = superCall ? this.evalNamed(superCall.named, env) : Object.create(null);
      const sctor = sc.ctors.get(superCall?.name ?? '');
      if (superCall?.name && !sctor) this.cerr(`The superclass '${sc.name}' has no constructor named '${superCall.name}'.`, ctor);
      this.runCtor(obj, sc, sctor ?? null, [...superPos, ...sa], Object.assign(Object.create(null), superNamed, sn), node);
    } else if (superCall || superPos.length) {
      /* Object() — ignore */
    }
    if (ctor.body && ctor.body.k === 'block') {
      try { this.execBlock(ctor.body, env); } catch (e) { if (!(e instanceof ReturnSig)) throw e; }
    }
  }

  bindParams(params: Param[], args: any[], named: Record<string, any>, env: Env, fname: string, node: Node | undefined, hook?: (p: Param, v: any) => boolean, typeParams?: string[]) {
    let posCount = 0, reqPos = 0;
    for (const p of params) { if (p.kind !== 'named') posCount++; if (p.kind === 'pos') reqPos++; }
    if (args.length < reqPos) this.cerr(`Too few positional arguments to '${fname}': ${reqPos} required, ${args.length} given.`, node);
    if (args.length > posCount) this.cerr(`Too many positional arguments to '${fname}': ${posCount} expected, ${args.length} given.`, node);
    for (const k in named) if (!params.some((p) => p.kind === 'named' && p.name === k)) this.cerr(`No named parameter with the name '${k}' in '${fname}'.`, node);
    let i = 0;
    for (const p of params) {
      let v: any;
      if (p.kind === 'named') {
        if (p.name in named) v = named[p.name];
        else if (p.required) this.cerr(`The named parameter '${p.name}' is required in '${fname}', but there's no corresponding argument.`, node);
        else v = p.def ? this.eval(p.def, env) : null;
      } else {
        v = i < args.length ? args[i] : p.def ? this.eval(p.def, env) : null;
        i++;
      }
      if (p.type) v = this.coerce(v, p.type, `parameter '${p.name}' of '${fname}'`, node, typeParams);
      if (hook && hook(p, v)) { env.declare(p.name, v, true); continue; }
      env.declare(p.name, v, false, p.type ?? null);
    }
  }
  evalNamed(named: [string, Node][], env: Env): Record<string, any> {
    const out: Record<string, any> = Object.create(null);
    for (const [k, e] of named) { if (k in out) this.cerr(`The argument for the named parameter '${k}' was already specified.`, e); out[k] = this.eval(e, env); }
    return out;
  }

  callClosure(c: Closure, args: any[], named: Record<string, any>, node?: Node): any {
    if (++this.depth > this.limits.maxDepth) { this.depth--; throw new EngineError(`Stack Overflow: more than ${this.limits.maxDepth} nested calls (check for infinite recursion).`, node?.line, node?.col, 'limit'); }
    const d = c.decl;
    const env = new Env(c.env);
    env.fnInfo = { isAsync: !!d.isAsync, name: d.name ?? '<anonymous>' };
    const fname = d.name ?? 'closure';
    let result: any = null;
    try {
      this.bindParams(d.params, args, named, env, fname, node, undefined, (d as any).typeParams);
      if (d.body === null) this.rerr(`'${fname}' is abstract and has no body.`, node);
      if (d.body.k === 'arrow') result = this.eval(d.body.e, env);
      else { try { this.execBlock(d.body, env); } catch (e) { if (e instanceof ReturnSig) result = e.value; else throw e; } }
    } catch (e) {
      if (d.isAsync && e instanceof DartThrow) { this.depth--; return new DFuture(null, e.value, true); }
      this.depth--; throw e;
    }
    this.depth--;
    const rt = d.retType;
    if (d.isAsync) {
      if (result instanceof DFuture) return result;
      const inner = rt && rt.name === 'Future' ? rt.args[0] : null;
      if (inner) result = this.coerce(result, inner, `the return value of '${fname}'`, node, (d as any).typeParams);
      return new DFuture(result);
    }
    if (rt && rt.name !== 'void' && rt.name !== 'dynamic') {
      if (result === null && !rt.nullable && d.body.k === 'block' && !/^[A-Z]$/.test(rt.name) && rt.name !== 'Future') {
        this.cerr(`The function '${fname}' has return type '${rt.name}' but returned null (missing return statement?).`, d.body);
      }
      result = this.coerce(result, rt, `the return value of '${fname}'`, node, (d as any).typeParams);
    }
    return result;
  }

  // ---------- statements ----------
  execBlock(b: Node, env: Env) {
    const e = new Env(env);
    for (const s of b.body) this.exec(s, e);
  }
  execVar(d: Node, env: Env) {
    for (const v of d.vars) {
      if (env.vars.has(v.name)) this.cerr(`'${v.name}' is already declared in this scope.`, d);
      let val = v.init ? this.eval(v.init, env) : (d.type && !d.type.nullable && d.type.name !== 'dynamic') || d.isFinal || d.isLate ? UNINIT : null;
      if (d.isConst) freeze(val);
      if (!d.type && v.init && val === null && false) { /* var x = null -> dynamic */ }
      val = this.coerce(val, d.type, `variable '${v.name}'`, d);
      env.declare(v.name, val, d.isFinal || d.isConst, d.type);
    }
  }
  exec(s: Node, env: Env): void {
    this.tick(s);
    switch (s.k) {
      case 'expr': this.eval(s.e, env); return;
      case 'var': this.execVar(s, env); return;
      case 'block': this.execBlock(s, env); return;
      case 'empty': return;
      case 'if': {
        const c = this.eval(s.cond, env);
        if (typeof c !== 'boolean') this.cerr(`Conditions must have a static type of 'bool' (got '${typeName(c)}'). Dart has no "truthy" values — compare explicitly, e.g. 'x != null' or 'list.isNotEmpty'.`, s.cond);
        if (c) this.exec(s.then, new Env(env)); else if (s.els) this.exec(s.els, new Env(env));
        return;
      }
      case 'while':
        for (;;) {
          this.tick(s);
          const c = this.eval(s.cond, env);
          if (typeof c !== 'boolean') this.cerr(`Conditions must have a static type of 'bool'.`, s.cond);
          if (!c) break;
          try { this.exec(s.body, new Env(env)); } catch (e) { if (e instanceof BreakSig) break; if (!(e instanceof ContinueSig)) throw e; }
        }
        return;
      case 'dowhile':
        for (;;) {
          this.tick(s);
          try { this.exec(s.body, new Env(env)); } catch (e) { if (e instanceof BreakSig) break; if (!(e instanceof ContinueSig)) throw e; }
          const c = this.eval(s.cond, env);
          if (typeof c !== 'boolean') this.cerr(`Conditions must have a static type of 'bool'.`, s.cond);
          if (!c) break;
        }
        return;
      case 'for': {
        const fenv = new Env(env);
        if (s.init) this.exec(s.init, fenv);
        for (;;) {
          this.tick(s);
          if (s.cond) { const c = this.eval(s.cond, fenv); if (typeof c !== 'boolean') this.cerr(`Conditions must have a static type of 'bool'.`, s.cond); if (!c) break; }
          // fresh per-iteration copy of loop variables (Dart closure semantics)
          const iter = new Env(fenv.parent); for (const [k, v] of fenv.vars) iter.vars.set(k, new Slot(k, v.v, v.final, v.type));
          try { this.exec(s.body, iter); } catch (e) { if (e instanceof BreakSig) { this.copyBack(iter, fenv); break; } if (!(e instanceof ContinueSig)) throw e; }
          this.copyBack(iter, fenv);
          for (const u of s.updates) this.eval(u, fenv);
        }
        return;
      }
      case 'forin': {
        const it = this.eval(s.iter, env);
        const items = this.iterItems(it, s.iter);
        const live = Array.isArray(it) ? it : null; const len0 = live?.length;
        for (const x of items) {
          this.tick(s);
          if (live && live.length !== len0) this.throwDart('StateError', 'Concurrent modification during iteration: the list was changed inside its own for-in loop.');
          const ienv = new Env(env);
          if (s.assignOnly) { const r = this.lookup(env, s.name); if (!r) this.rerr(`Undefined name '${s.name}'.`, s); r.set(x); } else ienv.declare(s.name, x);
          try { this.exec(s.body, ienv); } catch (e) { if (e instanceof BreakSig) break; if (!(e instanceof ContinueSig)) throw e; }
        }
        return;
      }
      case 'return': throw new ReturnSig(s.e ? this.eval(s.e, env) : null);
      case 'break': throw new BreakSig();
      case 'continue': throw new ContinueSig();
      case 'rethrow': { const ex = this.excStack[this.excStack.length - 1]; if (!ex) this.cerr("'rethrow' can only be used inside a catch clause.", s); throw ex; }
      case 'switch': {
        const v = this.eval(s.e, env);
        let idx = s.cases.findIndex((c: any) => c.tests.some((t: Node) => this.matchPattern(v, t, null, env)));
        if (idx < 0) idx = s.cases.findIndex((c: any) => c.isDefault);
        if (idx < 0) return;
        const cenv = new Env(env);
        s.cases[idx].tests.forEach((t: Node) => this.matchPattern(v, t, cenv, env));
        try { for (const st of s.cases[idx].body) this.exec(st, cenv); } catch (e) { if (!(e instanceof BreakSig)) throw e; }
        return;
      }
      case 'try': {
        try {
          try { this.execBlock(s.body, env); }
          catch (e) {
            let ex: DartThrow | null = e instanceof DartThrow ? e : null;
            if (!ex) throw e;
            const handler = s.catches.find((c: any) => !c.type || this.typeMatches(ex!.value, c.type) || (c.type.name === 'Exception' && ex!.value instanceof DInstance && /Exception$/.test(ex!.value.cls.name)) || (c.type.name === 'Error' && ex!.value instanceof DInstance && /Error$/.test(ex!.value.cls.name)));
            if (!handler) throw e;
            const cenv = new Env(env);
            if (handler.ev) cenv.declare(handler.ev, ex.value);
            if (handler.sv) cenv.declare(handler.sv, ex.stack);
            this.excStack.push(ex);
            try { this.execBlock(handler.body, cenv); } finally { this.excStack.pop(); }
          }
        } finally {
          if (s.fin) this.execBlock(s.fin, env);
        }
        return;
      }
      case 'assert': {
        const c = this.eval(s.cond, env);
        if (c !== true) this.throwDart('AssertionError', s.msg ? this.str(this.eval(s.msg, env)) : 'Assertion failed');
        return;
      }
      case 'localFn': env.declare(s.fn.name, new Closure(s.fn, env), true); return;
    }
    this.rerr(`Unsupported statement '${s.k}'.`, s);
  }
  copyBack(from: Env, to: Env) { for (const [k, v] of from.vars) { const t = to.vars.get(k); if (t) t.v = v.v; } }
  iterItems(it: any, node?: Node): any[] {
    if (Array.isArray(it)) return [...it];
    if (it instanceof DIter) return it.items;
    if (it instanceof Set) return [...it];
    if (it instanceof Map) this.cerr("A Map isn't iterable. Iterate over map.keys, map.values or map.entries instead.", node);
    if (typeof it === 'string') this.cerr("A String isn't iterable in Dart. Use split('') or runes.", node);
    this.cerr(`The type '${typeName(it)}' used in the 'for' loop must implement 'Iterable'.`, node);
  }
  matchPattern(v: any, p: Node, bindEnv: Env | null, evalEnv: Env = this.globals): boolean {
    if (p.k === 'wild') return true;
    if (p.k === 'typePat') { const ok = this.typeMatches(v, p.type) && v !== null; if (ok && p.bind && bindEnv) bindEnv.declare(p.bind, v); return ok; }
    if (p.k === 'orPat') return this.matchPattern(v, p.a, bindEnv, evalEnv) || this.matchPattern(v, p.b, bindEnv, evalEnv);
    if (p.k === 'constPat') {
      const e = p.e;
      if (e.k === 'bin' && e.op === '||') return this.matchPattern(v, { k: 'constPat', e: e.l }, bindEnv, evalEnv) || this.matchPattern(v, { k: 'constPat', e: e.r }, bindEnv, evalEnv);
      if (e.k === 'bin' && ['<', '>', '<=', '>='].includes(e.op) && e.l.k === 'id' && e.l.name === '_') return false;
      return this.eq(v, this.eval(e, evalEnv));
    }
    return false;
  }

  // ---------- expressions ----------
  eval(n: Node, env: Env): any { const v = this.ev(n, env); return v === SHORT ? null : v; }
  ev(n: Node, env: Env): any {
    this.tick(n);
    switch (n.k) {
      case 'num': return n.isDouble ? new DDouble(n.v) : n.v;
      case 'str': return n.v;
      case 'interp': { let s = ''; for (const p of n.parts) s += this.str(this.eval(p, env)); if (s.length > 1e6) throw new EngineError('String size limit exceeded.', n.line, n.col, 'limit'); return s; }
      case 'bool': return n.v;
      case 'null': return null;
      case 'paren': return this.eval(n.e, env);
      case 'constExpr': {
        // Dart canonicalises const instances: an obviously-constant expression yields the same object every time.
        if (isStaticallyConst(n.e)) {
          if (!this.constCache.has(n)) this.constCache.set(n, freeze(this.eval(n.e, env)));
          return this.constCache.get(n);
        }
        return freeze(this.eval(n.e, env));
      }
      case 'id': {
        const r = this.lookup(env, n.name);
        if (!r) {
          if (FLUTTER_HINT.has(n.name) && !this.imports.has('package:flutter/material.dart')) this.cerr(`Undefined name '${n.name}'. Did you forget "import 'package:flutter/material.dart';" at the top?`, n);
          if (['sqrt', 'pow', 'max', 'min', 'pi', 'Random', 'sin', 'cos'].includes(n.name)) this.cerr(`Undefined name '${n.name}'. Add "import 'dart:math';" at the top.`, n);
          if (['jsonEncode', 'jsonDecode'].includes(n.name)) this.cerr(`Undefined name '${n.name}'. Add "import 'dart:convert';" at the top.`, n);
          this.cerr(`Undefined name '${n.name}'.`, n);
        }
        const v = r.get();
        if (v === UNINIT) this.cerr(`The variable '${n.name}' must be assigned before it can be used.`, n);
        return v;
      }
      case 'this': { const t = this.thisOf(env); if (!t) this.cerr("Invalid reference to 'this' expression outside a class.", n); return t; }
      case 'cascadeTarget': return this.lookup(env, '__cascade')!.get();
      case 'list': {
        const out: any[] = [];
        for (const it of n.items) this.addElem(it, env, out, null);
        this.checkSize(out.length, n);
        return out;
      }
      case 'set': { const arr: any[] = []; for (const it of n.items) this.addElem(it, env, arr, null); const s = new Set<any>(); for (const x of arr) { if (![...s].some((y) => this.eq(x, y))) s.add(x); } return s; }
      case 'map': { const m = new Map<any, any>(); for (const it of n.items) this.addElem(it, env, null, m); this.checkSize(m.size, n); return m; }
      case 'lambda': return new Closure({ params: n.params, body: n.body, isAsync: n.isAsync, name: '<anonymous closure>' }, env);
      case 'cond': {
        const c = this.eval(n.c, env);
        if (typeof c !== 'boolean') this.cerr(`Conditions must have a static type of 'bool' (got '${typeName(c)}').`, n.c);
        return c ? this.eval(n.a, env) : this.eval(n.b, env);
      }
      case 'bin': {
        if (n.op === '&&' || n.op === '||') {
          const l = this.eval(n.l, env);
          if (typeof l !== 'boolean') this.cerr(`The operands of '${n.op}' must be bool (got '${typeName(l)}').`, n);
          if (n.op === '&&' ? !l : l) return l;
          const r = this.eval(n.r, env);
          if (typeof r !== 'boolean') this.cerr(`The operands of '${n.op}' must be bool (got '${typeName(r)}').`, n);
          return r;
        }
        if (n.op === '??') { const l = this.eval(n.l, env); return l !== null ? l : this.eval(n.r, env); }
        return this.binary(n.op, this.eval(n.l, env), this.eval(n.r, env), n);
      }
      case 'neg': { const v = this.eval(n.e, env); if (typeof v === 'number') return -v; if (v instanceof DDouble) return new DDouble(-v.v); this.cerr(`The operator 'unary-' isn't defined for '${typeName(v)}'.`, n); }
      case 'not': { const v = this.eval(n.e, env); if (typeof v !== 'boolean') this.cerr(`The operator '!' requires a bool operand (got '${typeName(v)}').`, n); return !v; }
      case 'bnot': { const v = this.eval(n.e, env); return ~v; }
      case 'preinc': case 'postinc': {
        const ref = this.ref(n.target, env);
        const old = ref.get();
        if (!isNum(old)) this.cerr(`The operator '${n.op}' isn't defined for '${typeName(old)}'.`, n);
        const nv = this.binary(n.op === '++' ? '+' : '-', old, 1, n);
        ref.set(nv);
        return n.k === 'preinc' ? nv : old;
      }
      case 'assign': {
        const ref = this.ref(n.target, env);
        if (n.op === '=') { const v = this.eval(n.value, env); ref.set(v); return v; }
        if (n.op === '??=') { const cur = ref.get(); if (cur !== null) return cur; const v = this.eval(n.value, env); ref.set(v); return v; }
        const v = this.binary(n.op.slice(0, -1), ref.get(), this.eval(n.value, env), n);
        ref.set(v); return v;
      }
      case 'is': { const v = this.eval(n.e, env); const r = this.typeMatches(v, n.type) && (v !== null || n.type.nullable || n.type.name === 'Null'); return n.neg ? !r : r; }
      case 'as': {
        const v = this.eval(n.e, env);
        if (!this.typeMatches(v, n.type)) this.throwDart('TypeError', `type '${typeName(v)}' is not a subtype of type '${n.type.name}' in type cast`);
        return n.type.name === 'double' && typeof v === 'number' ? v : v;
      }
      case 'member': {
        if (n.obj.k === 'super') return this.superMember(n.name, env, n);
        if (n.obj.k === 'id') { // prefixed enums/classes are fine; plain path below
        }
        const o = this.ev(n.obj, env);
        if (o === SHORT) return SHORT;
        return this.getMember(o, n.name, n);
      }
      case 'nullMember': {
        const o = this.ev(n.obj, env);
        if (o === SHORT || o === null) return SHORT;
        return this.getMember(o, n.name, n);
      }
      case 'nonNull': {
        const v = this.ev(n.e, env);
        if (v === SHORT) return SHORT;
        if (v === null) this.throwDart('TypeError', "Null check operator used on a null value");
        return v;
      }
      case 'index': {
        const o = this.ev(n.obj, env);
        if (o === SHORT) return SHORT;
        if (o === null && n.nullSafe) return SHORT;
        return this.indexGet(o, this.eval(n.idx, env), n);
      }
      case 'call': return this.evalCall(n, env);
      case 'cascade': {
        const t = this.eval(n.target, env);
        const cenv = new Env(env); cenv.declare('__cascade', t);
        for (const s of n.sections) this.eval(s, cenv);
        return t;
      }
      case 'throw': {
        const v = this.eval(n.e, env);
        if (v === null) this.throwDart('TypeError', 'Throw of null.');
        throw new DartThrow(v, `#0 ${this.fnName(env)} (line ${n.line})`);
      }
      case 'await': {
        let inAsync = false;
        for (let e: Env | null = env; e; e = e.parent) if (e.fnInfo) { inAsync = e.fnInfo.isAsync; break; }
        if (!inAsync) this.cerr("The 'await' expression can only be used in an 'async' function. Mark the enclosing function with 'async'.", n);
        const v = this.eval(n.e, env);
        if (v instanceof DFuture) { v.handled = true; if (v.failed) throw new DartThrow(v.error, '#0 <asynchronous suspension>'); return v.value; }
        return v;
      }
      case 'switchExpr': {
        const v = this.eval(n.e, env);
        for (const arm of n.arms) {
          const aenv = new Env(env);
          if (this.matchPattern(v, arm.pat, aenv, env)) return this.eval(arm.e, aenv);
        }
        this.throwDart('StateError', `No switch expression arm matched the value '${this.str(v)}'. Switch expressions must be exhaustive (add a '_' arm).`);
      }
      case 'super': this.cerr("'super' must be followed by a member access, e.g. super.build(context).", n);
    }
    this.rerr(`Unsupported expression '${n.k}'.`, n);
  }
  fnName(env: Env) { for (let e: Env | null = env; e; e = e.parent) if (e.fnInfo) return e.fnInfo.name; return 'main'; }

  addElem(it: Node, env: Env, arr: any[] | null, map: Map<any, any> | null) {
    if (it.k === 'spread') {
      const v = this.eval(it.e, env);
      if (v === null) { if (it.nullAware) return; this.throwDart('TypeError', "Spread of a null value. Use '...?' for nullable collections."); }
      if (map) { if (!(v instanceof Map)) this.cerr('Only maps can be spread into a map literal.', it); for (const [k, x] of v) map.set(k, x); }
      else arr!.push(...this.iterItems(v, it));
      return;
    }
    if (it.k === 'ifElem') {
      const c = this.eval(it.cond, env);
      if (typeof c !== 'boolean') this.cerr("Conditions must have a static type of 'bool'.", it);
      if (c) this.addElem(it.then, env, arr, map); else if (it.els) this.addElem(it.els, env, arr, map);
      return;
    }
    if (it.k === 'forElem') {
      for (const x of this.iterItems(this.eval(it.iter, env), it)) { const e2 = new Env(env); e2.declare(it.name, x); this.addElem(it.body, e2, arr, map); }
      return;
    }
    if (it.k === 'forClassicElem') {
      const fenv = new Env(env);
      if (it.init) this.exec(it.init, fenv);
      for (;;) {
        this.tick(it);
        if (it.cond && this.eval(it.cond, fenv) !== true) break;
        const iter = new Env(fenv.parent); for (const [k, v] of fenv.vars) iter.vars.set(k, new Slot(k, v.v, v.final, v.type));
        this.addElem(it.body, iter, arr, map);
        for (const u of it.updates) this.eval(u, fenv);
      }
      return;
    }
    if (it.k === 'entry') {
      if (!map) this.cerr("A map entry ('key: value') can't be used in a list or set literal.", it);
      map.set(this.eval(it.key, env), this.eval(it.value, env));
      return;
    }
    if (map) this.cerr('Expected a map entry (key: value) in the map literal.', it);
    arr!.push(this.eval(it, env));
  }

  superMember(name: string, env: Env, n: Node): any {
    const inst = this.thisOf(env); const dc = this.defClsOf(env);
    if (!inst || !dc || !dc.superclass) this.cerr("'super' can only be used inside a subclass method.", n);
    for (const c of dc.superclass.chain()) {
      const g = c.getters.get(name); if (g) return this.callClosure(new Closure(g, this.methodEnv(inst, c), inst, c), [], {});
      const m = c.methods.get(name); if (m) { if (m.body === null) this.cerr(`'${c.name}.${name}' is abstract and can't be invoked through super.`, n); return new Closure(m, this.methodEnv(inst, c), inst, c); }
    }
    if (name === 'toString') return new NativeFn('toString', () => `Instance of '${inst.cls.name}'`);
    if (inst.fields.has(name)) return inst.fields.get(name);
    this.rerr(`The superclass has no member named '${name}'.`, n);
  }

  evalCall(n: Node, env: Env): any {
    const f = n.fn;
    const args = (): any[] => n.args.map((a: Node) => this.eval(a, env));
    if (f.k === 'member' || f.k === 'nullMember') {
      let obj: any;
      if (f.obj.k === 'super') { const fn = this.superMember(f.name, env, f); return this.callValue(fn, args(), this.evalNamed(n.named, env), n); }
      obj = this.ev(f.obj, env);
      if (obj === SHORT) return SHORT;
      if (obj === null && f.k === 'nullMember') return SHORT;
      if (obj === null) this.throwDart('NoSuchMethodError', `The method '${f.name}' was called on null. Use '?.' or check for null first.`);
      const a = args(); const nm = this.evalNamed(n.named, env);
      if (obj instanceof DInstance) {
        const m = this.findMethod(obj.cls, f.name);
        if (m) return this.callClosure(new Closure(m.decl, this.methodEnv(obj, m.cls), obj, m.cls), a, nm, n);
      }
      const fn = this.getMember(obj, f.name, f);
      const out = this.callValue(fn, a, nm, n);
      if (out instanceof NObj && !out.src && !(obj instanceof NObj)) out.src = n;
      return out;
    }
    const fn = this.ev(f, env);
    if (fn === SHORT) return SHORT;
    const out = this.callValue(fn, args(), this.evalNamed(n.named, env), n);
    if (out instanceof NObj && !out.src) out.src = n; // link widget/value objects to their source call (inspector)
    return out;
  }

  ref(t: Node, env: Env): { get(): any; set(v: any): void } {
    if (t.k === 'id') {
      const r = this.lookup(env, t.name);
      if (!r) this.cerr(`Undefined name '${t.name}'. Declare it first (e.g. 'var ${t.name} = ...;').`, t);
      return r;
    }
    if (t.k === 'member' || t.k === 'nullMember') {
      const o = this.eval(t.obj, env);
      return { get: () => (o === null && t.k === 'nullMember' ? null : this.getMember(o, t.name, t)), set: (v) => { if (o === null && t.k === 'nullMember') return; this.setMember(o, t.name, v, t); } };
    }
    if (t.k === 'index') {
      const o = this.eval(t.obj, env); const i = this.eval(t.idx, env);
      return { get: () => this.indexGet(o, i, t), set: (v) => this.indexSet(o, i, v, t) };
    }
    if (t.k === 'cascadeTarget') { const o = this.lookup(env, '__cascade')!.get(); return { get: () => o, set: () => this.cerr('Invalid cascade assignment', t) }; }
    this.cerr('Invalid assignment target.', t);
  }
  indexGet(o: any, i: any, n: Node): any {
    if (o === null) this.throwDart('NoSuchMethodError', "The operator '[]' was called on null.");
    if (Array.isArray(o)) {
      if (typeof i !== 'number') this.cerr(`List indices must be int (got '${typeName(i)}').`, n);
      if (i < 0 || i >= o.length) this.throwDart('RangeError', `RangeError (index): Invalid value: ${o.length ? `Not in inclusive range 0..${o.length - 1}` : 'Valid value range is empty'}: ${i}`);
      return o[i];
    }
    if (o instanceof Map) { for (const [k, v] of o) if (this.eq(k, i)) return v; return null; }
    if (typeof o === 'string') { if (typeof i !== 'number' || i < 0 || i >= o.length) this.throwDart('RangeError', `RangeError (index): Invalid value: ${i}`); return o[i]; }
    if (o instanceof DInstance) { const m = this.findMethod(o.cls, 'operator[]'); if (m) return this.callClosure(new Closure(m.decl, this.methodEnv(o, m.cls), o, m.cls), [i], {}); }
    this.cerr(`The operator '[]' isn't defined for the type '${typeName(o)}'.`, n);
  }
  indexSet(o: any, i: any, v: any, n: Node) {
    if (unmodifiable.has(o)) this.throwDart('UnsupportedError', 'Cannot modify an unmodifiable (const) collection.');
    if (Array.isArray(o)) { if (typeof i !== 'number' || i < 0 || i >= o.length) this.throwDart('RangeError', `RangeError (index): Invalid value: ${i}`); o[i] = v; return; }
    if (o instanceof Map) { for (const k of o.keys()) if (this.eq(k, i)) { o.set(k, v); return; } o.set(i, v); this.checkSize(o.size, n); return; }
    this.cerr(`The operator '[]=' isn't defined for the type '${typeName(o)}'.`, n);
  }

  binary(op: string, a: any, b: any, n: Node): any {
    if (op === '==') return this.eq(a, b);
    if (op === '!=') return !this.eq(a, b);
    if (a instanceof DInstance) {
      const m = this.findMethod(a.cls, 'operator' + op);
      if (m) return this.callClosure(new Closure(m.decl, this.methodEnv(a, m.cls), a, m.cls), [b], {}, n);
      this.cerr(`The operator '${op}' isn't defined for the class '${a.cls.name}'.`, n);
    }
    if (isNum(a) && isNum(b)) {
      const x = numVal(a), y = numVal(b);
      const dbl = a instanceof DDouble || b instanceof DDouble;
      const wrap = (r: number) => (dbl ? new DDouble(r) : r);
      switch (op) {
        case '+': return wrap(x + y);
        case '-': return wrap(x - y);
        case '*': return wrap(x * y);
        case '/': return new DDouble(x / y);
        case '~/': if (y === 0) this.throwDart('UnsupportedError', 'IntegerDivisionByZeroException: integer division by zero'); return Math.trunc(x / y);
        case '%': { if (y === 0 && !dbl) this.throwDart('UnsupportedError', 'IntegerDivisionByZeroException'); const r = x % y; return wrap(r < 0 ? r + Math.abs(y) : r); }
        case '<': return x < y; case '>': return x > y; case '<=': return x <= y; case '>=': return x >= y;
        case '&': return x & y; case '|': return x | y; case '^': return x ^ y;
      }
    }
    if (typeof a === 'boolean' && typeof b === 'boolean' && ['&', '|', '^'].includes(op)) return op === '&' ? a && b : op === '|' ? a || b : a !== b;
    if (typeof a === 'string') {
      if (op === '+') { if (typeof b !== 'string') this.cerr(`A value of type '${typeName(b)}' can't be added to a String. Use interpolation ('\$value') or .toString().`, n); return a + b; }
      if (op === '*' && typeof b === 'number') { this.checkSize(a.length * b, n); return a.repeat(Math.max(0, b)); }
      if (['<', '>', '<=', '>='].includes(op)) this.cerr(`The operator '${op}' isn't defined for 'String'. Use a.compareTo(b) instead.`, n);
    }
    if (Array.isArray(a) && op === '+' && Array.isArray(b)) return [...a, ...b];
    if (a instanceof NObj && b instanceof NObj && a.kind === 'Duration' && b.kind === 'Duration' && (op === '+' || op === '-')) return new NObj('Duration', { ms: op === '+' ? a.props.ms + b.props.ms : a.props.ms - b.props.ms });
    if (a === null || b === null) this.throwDart('NoSuchMethodError', `The operator '${op}' was called on null. A nullable value must be checked before arithmetic.`);
    this.cerr(`The operator '${op}' isn't defined between '${typeName(a)}' and '${typeName(b)}'.`, n);
  }
}

export interface RunResult { ok: boolean; output: string[]; error?: { message: string; line: number; col: number; kind: string }; interp?: Interpreter }

export function formatError(e: any, interp?: Interpreter): { message: string; line: number; col: number; kind: string } {
  if (e instanceof DartSyntaxError) return { message: (e.unsupported ? 'Unsupported offline: ' : 'Syntax error: ') + e.message, line: e.line, col: e.col, kind: e.unsupported ? 'unsupported' : 'syntax' };
  if (e instanceof EngineError) return { message: (e.kind === 'compile' ? 'Error: ' : e.kind === 'limit' ? 'Stopped: ' : 'Runtime error: ') + e.message, line: e.line, col: e.col, kind: e.kind };
  if (e instanceof DartThrow) return { message: 'Unhandled exception:\n' + (interp ? interp.str(e.value) : String(e.value)), line: 0, col: 0, kind: 'exception' };
  if (e instanceof ReturnSig || e instanceof BreakSig || e instanceof ContinueSig) return { message: "Error: 'break'/'continue' used outside of a loop.", line: 0, col: 0, kind: 'compile' };
  if (e instanceof RangeError && /call stack/i.test(e.message)) return { message: 'Stopped: Stack Overflow (host recursion limit).', line: 0, col: 0, kind: 'limit' };
  return { message: 'Internal engine error: ' + (e?.message ?? String(e)), line: 0, col: 0, kind: 'internal' };
}

/** Parse + load + run main(), capturing output and errors. */
export function runProgram(src: string, limits: Partial<RunLimits> = {}, installFlutter?: (i: Interpreter) => void): RunResult {
  let interp: Interpreter | undefined;
  try {
    interp = new Interpreter(src, limits);
    if (installFlutter) interp.hooks.installFlutter = installFlutter;
    interp.load();
    interp.runMain();
    return { ok: true, output: interp.output, interp };
  } catch (e) {
    return { ok: false, output: interp?.output ?? [], error: formatError(e, interp), interp };
  }
}
export { DDouble, DIter, NativeFn, NType, NObj, DInstance, DClass, DEnumValue, DFuture, Closure, Env, DartThrow, EngineError, freeze, toStr };

/** Conservative check: literals, collections and constructor/static calls with constant arguments only. */
export function isStaticallyConst(n: Node): boolean {
  if (!n) return true;
  switch (n.k) {
    case 'num': case 'str': case 'bool': case 'null': return true;
    case 'neg': case 'paren': case 'constExpr': return isStaticallyConst(n.e);
    case 'list': case 'set': return n.items.every((x: Node) => isStaticallyConst(x));
    case 'map': return n.items.every((x: Node) => x.k === 'entry' && isStaticallyConst(x.key) && isStaticallyConst(x.value));
    case 'id': return /^[A-Z]/.test(n.name);
    case 'member': return isStaticallyConst(n.obj);
    case 'call': return isStaticallyConst(n.fn) && n.args.every((a: Node) => isStaticallyConst(a)) && n.named.every(([, v]: [string, Node]) => isStaticallyConst(v));
    case 'bin': return isStaticallyConst(n.l) && isStaticallyConst(n.r);
    default: return false;
  }
}
