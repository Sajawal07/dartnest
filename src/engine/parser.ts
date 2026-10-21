// Recursive-descent parser for the documented Dart subset.
import { lex, Tok, DartSyntaxError, SOFT_KEYWORDS } from './lexer';

export type Node = any;
export interface TypeRef { name: string; args: TypeRef[]; nullable: boolean }
export interface Param { name: string; type?: TypeRef; kind: 'pos' | 'opt' | 'named'; required: boolean; def?: Node; thisField?: boolean; superParam?: boolean }

const ALLOWED_IMPORTS = ['package:flutter/material.dart', 'dart:math', 'dart:convert', 'dart:async', 'package:flutter/widgets.dart', 'dart:core'];

const UNSUPPORTED: Record<string, string> = {
  extension: 'Extension declarations are covered in lessons, but the offline engine can only analyse them, not execute them.',
  typedef: 'typedef is not executable in the offline engine. Write the function type inline (e.g. int Function(int)).',
  yield: 'Generators (sync*/async* with yield) are not supported by the offline engine.',
  export: 'Library directives are not supported in a single-file program.',
  library: 'Library directives are not supported in a single-file program.',
  part: 'part/part of directives are not supported in a single-file program.',
  external: 'external functions require native code and are not supported.',
};

export class Parser {
  toks: Tok[]; i = 0; imports: string[] = [];
  constructor(src: string, lineOffset = 0, colOffset = 0) { this.toks = lex(src, lineOffset, colOffset); }

  peek(o = 0): Tok { return this.toks[Math.min(this.i + o, this.toks.length - 1)]; }
  next(): Tok { return this.toks[this.i++] ?? this.toks[this.toks.length - 1]; }
  at(v: string, o = 0): boolean { const t = this.peek(o); return (t.t === 'op' || t.t === 'kw') && t.v === v; }
  isId(o = 0): boolean { const t = this.peek(o); return t.t === 'id' || (t.t === 'kw' && SOFT_KEYWORDS.has(t.v)); }
  eat(v: string): boolean { if (this.at(v)) { this.i++; return true; } return false; }
  err(msg: string, t: Tok = this.peek(), unsupported = false): never { throw new DartSyntaxError(msg, t.line, t.col, unsupported); }
  expect(v: string, what?: string): Tok {
    if (this.at(v)) return this.next();
    const t = this.peek();
    this.err(`Expected '${v}'${what ? ' ' + what : ''} but found '${t.v}'`, t);
  }
  ident(what = 'an identifier'): string {
    if (this.isId()) return this.next().v;
    const t = this.peek();
    if (t.t === 'kw') this.err(`'${t.v}' is a reserved word and can't be used as ${what}`, t);
    this.err(`Expected ${what} but found '${t.v}'`, t);
  }
  pos(t: Tok = this.peek()) { return { line: t.line, col: t.col, off: t.pos }; }

  // ---------- program ----------
  parseProgram(): Node {
    const decls: Node[] = [];
    while (this.peek().t !== 'eof') {
      this.skipAnnotations();
      const t = this.peek();
      if (this.at('import')) {
        this.next();
        const s = this.next();
        if (s.t !== 'str') this.err('Expected a URI string after import', s);
        if (!ALLOWED_IMPORTS.includes(s.v)) this.err(`Import '${s.v}' is not available offline. Supported: ${ALLOWED_IMPORTS.slice(0, 4).join(', ')}.`, s, true);
        this.imports.push(s.v);
        while (!this.at(';') && this.peek().t !== 'eof') this.next();
        this.expect(';');
        continue;
      }
      if (t.t === 'kw' && UNSUPPORTED[t.v] && !(this.peek(1).t === 'op' && ['(', '=', ';'].includes(this.peek(1).v))) this.err(UNSUPPORTED[t.v], t, true);
      if (this.at('abstract') || this.at('sealed') || this.at('base') || this.at('interface') || (this.at('final') && this.at('class', 1)) || this.at('class') || (this.at('mixin') && this.at('class', 1))) { decls.push(this.parseClass()); continue; }
      if (this.at('mixin')) { decls.push(this.parseMixin()); continue; }
      if (this.at('enum')) { decls.push(this.parseEnum()); continue; }
      decls.push(this.parseTopLevel());
    }
    return { k: 'program', decls, imports: this.imports };
  }

  skipAnnotations() {
    while (this.at('@')) {
      this.next(); this.ident('an annotation name');
      while (this.eat('.')) this.ident();
      if (this.at('(')) this.skipBalanced('(', ')');
    }
  }
  skipBalanced(open: string, close: string) {
    let depth = 0;
    do {
      const t = this.next();
      if (t.t === 'eof') this.err(`Unbalanced '${open}'`, t);
      if (t.t === 'op' && t.v === open) depth++;
      if (t.t === 'op' && t.v === close) depth--;
    } while (depth > 0);
  }

  // ---------- types ----------
  tryType(): TypeRef | null {
    const save = this.i;
    const t = this.peek();
    let name: string;
    if (this.at('void')) { this.next(); name = 'void'; }
    else if (this.isId() && !(t.t === 'kw' && ['get', 'set', 'operator', 'required', 'covariant', 'factory', 'static', 'async'].includes(t.v))) {
      name = this.next().v;
      if (this.at('.') && this.isId(1) && /^[A-Z]/.test(this.peek(1).v) && /^[a-z]/.test(name)) { this.next(); name = this.next().v; } // prefixed type
    } else return null;
    const args: TypeRef[] = [];
    if (this.at('<')) {
      this.next();
      for (;;) {
        const a = this.tryType();
        if (!a) { this.i = save; return null; }
        args.push(a);
        if (this.eat(',')) continue;
        if (this.eat('>')) break;
        this.i = save; return null;
      }
    }
    let ty: TypeRef = { name, args, nullable: false };
    if (this.at('?') && !this.looksLikeConditional()) { this.next(); ty.nullable = true; }
    while (this.peek().t === 'id' && this.peek().v === 'Function' && this.at('(', 1)) {
      this.next(); this.skipBalanced('(', ')');
      ty = { name: 'Function', args: [ty], nullable: false };
      if (this.at('?') && !this.looksLikeConditional()) { this.next(); ty.nullable = true; }
    }
    if (ty.name === 'Function' && this.at('(') && ty.args.length === 0) { /* plain Function */ }
    return ty;
  }
  looksLikeConditional(): boolean {
    // `Type?` vs `cond ? a : b` — a nullable type is followed by an identifier/this
    const n1 = this.peek(1);
    return !(n1.t === 'id' || (n1.t === 'kw' && (SOFT_KEYWORDS.has(n1.v) || n1.v === 'this' || n1.v === 'Function')) || (n1.t === 'op' && [',', '>', ')', '??', ';', ']', '}', '&&', '||', '==', '!=', '=>'].includes(n1.v)));
  }

  // Is the upcoming text "Type name" (a declaration)?
  declAhead(): { type: TypeRef | null } | null {
    const save = this.i;
    if (this.at('var') || this.at('final') || this.at('const') || this.at('late')) return { type: null };
    const ty = this.tryType();
    if (ty && this.isId() && !(this.peek().t === 'kw' && ['in', 'is', 'as'].includes(this.peek().v))) {
      const after = this.peek(1);
      this.i = save;
      if (after.t === 'op' && ['=', ';', ',', '(', '<', ')'].includes(after.v)) return { type: ty };
      if (after.t === 'kw' && after.v === 'in') return { type: ty };
      return null;
    }
    this.i = save;
    return null;
  }

  // ---------- declarations ----------
  parseTopLevel(): Node {
    const start = this.peek();
    if (this.at('var') || this.at('final') || this.at('const') || this.at('late')) return this.parseVarDecl(true);
    const save = this.i;
    const ty = this.tryType();
    if (ty && (this.at('get') && this.isId(1))) { this.next(); const name = this.ident(); const body = this.parseFnBody(); return { k: 'fn', name, params: [], body, retType: ty, isGetter: true, ...this.pos(start) }; }
    if (ty && this.isId()) {
      if (this.at('(', 1) || this.at('<', 1)) return this.parseFunction(ty);
      this.i = save;
      return this.parseVarDecl(true);
    }
    this.i = save;
    if (this.isId() && (this.at('(', 1) || this.at('<', 1))) return this.parseFunction(null);
    this.err(`Expected a declaration (function, variable, class or enum) but found '${start.v}'. Top-level statements must be inside main().`, start);
  }

  parseFunction(retType: TypeRef | null): Node {
    const t = this.peek();
    const name = this.ident('a function name');
    const typeParams = this.parseTypeParams();
    const params = this.parseParams();
    const { body, isAsync } = this.parseFnBodyAsync();
    return { k: 'fn', name, params, body, retType, isAsync, typeParams, ...this.pos(t) };
  }
  parseTypeParams(): string[] {
    const out: string[] = [];
    if (this.eat('<')) {
      do { out.push(this.ident('a type parameter')); if (this.eat('extends')) this.tryType(); } while (this.eat(','));
      this.expect('>');
    }
    return out;
  }

  parseParams(): Param[] {
    this.expect('(', 'to start the parameter list');
    const params: Param[] = [];
    let mode: 'pos' | 'opt' | 'named' = 'pos';
    while (!this.at(')')) {
      if (this.eat('[')) { mode = 'opt'; continue; }
      if (this.eat('{')) { mode = 'named'; continue; }
      if (this.eat(']') || this.eat('}')) { continue; }
      this.skipAnnotations();
      const required = this.eat('required');
      this.eat('covariant');
      if (this.at('final') || this.at('var') || this.at('const')) this.next();
      let p: Param;
      if (this.at('this') || this.at('super')) {
        const sup = this.next().v === 'super';
        this.expect('.');
        const name = this.ident('a field name');
        if (this.at('(')) this.skipBalanced('(', ')');
        p = { name, kind: mode, required, thisField: !sup, superParam: sup };
      } else {
        const save = this.i;
        const ty = this.tryType();
        let name: string; let typed = false;
        if (ty && this.isId()) { name = this.ident(); typed = true; }
        else { this.i = save; name = this.ident('a parameter name'); }
        if (this.at('(')) { this.skipBalanced('(', ')'); } // old-style function-typed param
        p = { name, type: typed ? ty! : undefined, kind: mode, required };
      }
      if (this.eat('=') || (mode !== 'pos' && this.eat(':'))) p.def = this.parseExpr();
      params.push(p);
      if (!this.eat(',')) { if (this.eat(']') || this.eat('}')) { /* closed group */ } }
      if (this.at(')')) break;
    }
    this.expect(')', 'to close the parameter list');
    return params;
  }

  parseFnBodyAsync(): { body: Node; isAsync: boolean } {
    let isAsync = false;
    if (this.at('async')) { this.next(); isAsync = true; if (this.at('*')) this.err('async* generators are not supported offline', this.peek(), true); }
    if (this.at('sync')) this.err('sync* generators are not supported offline', this.peek(), true);
    return { body: this.parseFnBody(), isAsync };
  }
  parseFnBody(): Node {
    if (this.eat('=>')) { const e = this.parseExpr(); this.expect(';', 'after the arrow function body'); return { k: 'arrow', e }; }
    if (this.at('{')) return this.parseBlock();
    if (this.eat(';')) return null; // abstract
    this.err(`Expected a function body ('{' or '=>') but found '${this.peek().v}'`);
  }

  parseVarDecl(requireSemi: boolean): Node {
    const t = this.peek();
    let isFinal = false, isConst = false, isLate = false;
    if (this.eat('late')) isLate = true;
    if (this.eat('final')) isFinal = true;
    else if (this.eat('const')) isConst = true;
    else this.eat('var');
    let type: TypeRef | null = null;
    const save = this.i;
    const ty = this.tryType();
    if (ty && this.isId()) type = ty; else this.i = save;
    const vars: { name: string; init: Node }[] = [];
    do {
      const name = this.ident('a variable name');
      let init = null;
      if (this.eat('=')) init = this.parseExpr();
      else if (isConst) this.err(`The const variable '${name}' must be initialized`);
      vars.push({ name, init });
    } while (this.eat(','));
    if (requireSemi) this.expect(';', 'after the variable declaration');
    return { k: 'var', vars, type, isFinal, isConst, isLate, ...this.pos(t) };
  }

  parseClass(): Node {
    const t = this.peek();
    let isAbstract = false;
    while (!this.at('class')) {
      const m = this.next().v;
      if (m === 'abstract' || m === 'sealed' || m === 'interface') isAbstract = true;
    }
    this.expect('class');
    const name = this.ident('a class name');
    this.parseTypeParams();
    let superName: string | null = null; const mixins: string[] = []; const interfaces: string[] = [];
    if (this.eat('extends')) superName = this.tryType()!.name;
    if (this.eat('with')) do { mixins.push(this.tryType()!.name); } while (this.eat(','));
    if (this.eat('implements')) do { interfaces.push(this.tryType()!.name); } while (this.eat(','));
    const body = this.parseClassBody(name);
    return { k: 'class', name, superName, mixins, interfaces, isAbstract, ...body, ...this.pos(t) };
  }
  parseMixin(): Node {
    const t = this.next();
    const name = this.ident('a mixin name');
    if (this.eat('on')) do { this.tryType(); } while (this.eat(','));
    const body = this.parseClassBody(name);
    return { k: 'class', name, superName: null, mixins: [], interfaces: [], isAbstract: true, isMixin: true, ...body, ...this.pos(t) };
  }
  parseEnum(): Node {
    const t = this.next();
    const name = this.ident('an enum name');
    this.expect('{');
    const values: string[] = [];
    while (!this.at('}') && !this.at(';')) {
      this.skipAnnotations();
      values.push(this.ident('an enum value'));
      if (this.at('(')) this.err('Enhanced enums with constructors are not supported offline; use a simple enum plus a switch or extension-free helper function.', this.peek(), true);
      if (!this.eat(',')) break;
    }
    if (this.eat(';')) { if (!this.at('}')) this.err('Enhanced enum members are not supported offline.', this.peek(), true); }
    this.expect('}');
    return { k: 'enum', name, values, ...this.pos(t) };
  }

  parseClassBody(className: string) {
    this.expect('{', 'to start the class body');
    const fields: Node[] = [], methods: Node[] = [], ctors: Node[] = [], getters: Node[] = [], setters: Node[] = [];
    const statics: Node[] = [];
    while (!this.eat('}')) {
      if (this.peek().t === 'eof') this.err(`Missing '}' to close class ${className}`);
      this.skipAnnotations();
      const mt = this.peek();
      const isStatic = this.eat('static');
      this.eat('external');
      if (this.at('factory')) {
        this.next(); this.ident();
        let cname = '';
        if (this.eat('.')) cname = this.ident();
        const params = this.parseParams();
        if (this.eat('=')) { this.err('Redirecting factory constructors are not supported offline', this.peek(), true); }
        const body = this.parseFnBody();
        ctors.push({ k: 'ctor', name: cname, params, body, factory: true, inits: [], ...this.pos(mt) });
        continue;
      }
      // constructor?
      const ctorStart = this.at('const') && this.peek(1).v === className ? 1 : 0;
      if (this.peek(ctorStart).v === className && (this.at('(', ctorStart + 1) || this.at('.', ctorStart + 1))) {
        if (ctorStart) this.next();
        this.next();
        let cname = '';
        if (this.eat('.')) cname = this.ident();
        const params = this.parseParams();
        const inits: Node[] = [];
        let redirect: Node = null;
        if (this.eat(':')) {
          do {
            if (this.at('super')) {
              this.next(); let sname = ''; if (this.eat('.')) sname = this.ident();
              const { args, named } = this.parseArgs();
              inits.push({ k: 'superInit', name: sname, args, named });
            } else if (this.at('this') && (this.at('(', 1) || (this.at('.', 1) && this.at('(', 3)))) {
              this.next(); let rname = ''; if (this.eat('.')) rname = this.ident();
              const { args, named } = this.parseArgs();
              redirect = { name: rname, args, named };
            } else if (this.at('assert')) {
              this.next(); this.expect('('); const cond = this.parseExpr(); let msg = null; if (this.eat(',')) msg = this.parseExpr(); this.eat(','); this.expect(')');
              inits.push({ k: 'assertInit', cond, msg });
            } else {
              this.eat('this') && this.expect('.');
              const f = this.ident('a field name'); this.expect('=');
              inits.push({ k: 'fieldInit', name: f, e: this.parseAssign() });
            }
          } while (this.eat(','));
        }
        let body = null;
        if (!this.eat(';')) body = this.parseFnBody();
        ctors.push({ k: 'ctor', name: cname, params, body, inits, redirect, ...this.pos(mt) });
        continue;
      }
      if (this.at('var') || this.at('final') || this.at('const') || this.at('late')) {
        const d = this.parseVarDecl(true); (isStatic ? statics : fields).push(d); continue;
      }
      const save = this.i;
      let ty = this.tryType();
      if (ty && (ty.name === 'get' || ty.name === 'set' || ty.name === 'operator') && !this.isId() && !this.at('(')) { this.i = save; ty = null; }
      if (!ty || (!this.isId() && !this.at('get') && !this.at('set') && !this.at('operator'))) { this.i = save; ty = null; }
      if (this.at('get') && !this.at('(', 1)) {
        this.next(); const name = this.ident('a getter name');
        const body = this.parseFnBody();
        (isStatic ? statics : getters).push({ k: 'fn', name, params: [], body, retType: ty, isGetter: true, ...this.pos(mt) });
        continue;
      }
      if (this.at('set') && !this.at('(', 1)) {
        this.next(); const name = this.ident('a setter name');
        const params = this.parseParams(); const body = this.parseFnBody();
        setters.push({ k: 'fn', name, params, body, ...this.pos(mt) });
        continue;
      }
      if (this.at('operator')) {
        this.next(); const op = this.next().v + (this.at(']') ? this.next().v : '') + (this.at('=') && this.peek(-1).v === ']' ? this.next().v : '');
        const params = this.parseParams(); const body = this.parseFnBody();
        methods.push({ k: 'fn', name: 'operator' + op, params, body, retType: ty, ...this.pos(mt) });
        continue;
      }
      const name = this.ident('a member name');
      if (this.at('(') || this.at('<')) {
        const typeParams = this.parseTypeParams();
        const params = this.parseParams();
        const { body, isAsync } = this.parseFnBodyAsync();
        (isStatic ? statics : methods).push({ k: 'fn', name, params, body, retType: ty, isAsync, typeParams, ...this.pos(mt) });
        continue;
      }
      // typed field without var/final
      const vars: { name: string; init: Node }[] = [];
      let nm = name;
      for (;;) {
        let init = null; if (this.eat('=')) init = this.parseExpr();
        vars.push({ name: nm, init });
        if (!this.eat(',')) break;
        nm = this.ident();
      }
      this.expect(';', 'after the field declaration');
      (isStatic ? statics : fields).push({ k: 'var', vars, type: ty, isFinal: false, isConst: false, ...this.pos(mt) });
    }
    return { fields, methods, ctors, getters, setters, statics };
  }

  // ---------- statements ----------
  parseBlock(): Node {
    const t = this.expect('{', 'to start a block');
    const body: Node[] = [];
    while (!this.at('}')) {
      if (this.peek().t === 'eof') this.err("Missing '}' to close the block opened here", t);
      body.push(this.parseStmt());
    }
    this.next();
    return { k: 'block', body, ...this.pos(t) };
  }

  parseStmt(): Node {
    const t = this.peek();
    const P = this.pos(t);
    if (this.at('{')) return this.parseBlock();
    if (this.at(';')) { this.next(); return { k: 'empty' }; }
    if (this.at('if')) {
      this.next(); this.expect('('); const cond = this.parseExpr(); this.expect(')', 'after the if condition');
      const then = this.parseStmt(); let els = null;
      if (this.eat('else')) els = this.parseStmt();
      return { k: 'if', cond, then, els, ...P };
    }
    if (this.at('while')) {
      this.next(); this.expect('('); const cond = this.parseExpr(); this.expect(')');
      return { k: 'while', cond, body: this.parseStmt(), ...P };
    }
    if (this.at('do')) {
      this.next(); const body = this.parseStmt(); this.expect('while'); this.expect('('); const cond = this.parseExpr(); this.expect(')'); this.expect(';');
      return { k: 'dowhile', cond, body, ...P };
    }
    if (this.at('await') && this.at('for', 1)) this.err('await for (streams) is not supported by the offline engine', t, true);
    if (this.at('for')) return this.parseFor();
    if (this.at('return')) {
      this.next(); let e = null; if (!this.at(';')) e = this.parseExpr(); this.expect(';', 'after return');
      return { k: 'return', e, ...P };
    }
    if (this.at('break')) { this.next(); if (this.isId()) this.err('Labels are not supported offline', t, true); this.expect(';'); return { k: 'break', ...P }; }
    if (this.at('continue')) { this.next(); this.expect(';'); return { k: 'continue', ...P }; }
    if (this.at('rethrow')) { this.next(); this.expect(';'); return { k: 'rethrow', ...P }; }
    if (this.at('switch') ) {
      // statement switch (expression switch handled when used as expression)
      const save = this.i;
      this.next(); this.expect('('); const e = this.parseExpr(); this.expect(')'); this.expect('{');
      if (this.at('case') || this.at('default') || this.at('}')) return this.parseSwitchStmt(e, P);
      this.i = save;
    }
    if (this.at('try')) return this.parseTry();
    if (this.at('assert')) {
      this.next(); this.expect('('); const cond = this.parseExpr(); let msg = null; if (this.eat(',')) { if (!this.at(')')) msg = this.parseExpr(); } this.eat(','); this.expect(')'); this.expect(';');
      return { k: 'assert', cond, msg, ...P };
    }
    if (t.t === 'kw' && UNSUPPORTED[t.v]) this.err(UNSUPPORTED[t.v], t, true);
    const d = this.declAhead();
    if (d) {
      if (d.type && this.isId(this.typeLen())) {
        const save = this.i; const ty = this.tryType();
        if (this.isId() && (this.at('(', 1) || this.at('<', 1))) { return { k: 'localFn', fn: this.parseFunction(ty), ...P }; }
        this.i = save;
      }
      return this.parseVarDecl(true);
    }
    if (this.isId() && this.at('(', 1)) {
      // local function without return type: name(params) { ... }
      const save = this.i; this.next();
      try { this.skipBalanced('(', ')'); } catch { this.i = save; }
      const isFn = this.at('{') || this.at('=>') || this.at('async');
      this.i = save;
      if (isFn) return { k: 'localFn', fn: this.parseFunction(null), ...P };
    }
    const e = this.parseExpr();
    this.expect(';', 'after the expression');
    return { k: 'expr', e, ...P };
  }
  typeLen(): number { const s = this.i; this.tryType(); const n = this.i - s; this.i = s; return n; }

  parseFor(): Node {
    const P = this.pos(); this.next(); this.expect('(');
    // for-in?
    const save = this.i;
    if (this.at('var') || this.at('final')) this.next();
    const ty = this.tryType();
    if (ty && this.isId() && this.at('in', 1)) { const name = this.ident(); this.next(); const it = this.parseExpr(); this.expect(')'); return { k: 'forin', name, iter: it, body: this.parseStmt(), ...P }; }
    this.i = save;
    if ((this.at('var') || this.at('final')) && this.isId(1) && this.at('in', 2)) { this.next(); const name = this.ident(); this.next(); const it = this.parseExpr(); this.expect(')'); return { k: 'forin', name, iter: it, body: this.parseStmt(), ...P }; }
    if (this.isId() && this.at('in', 1)) { const name = this.ident(); this.next(); const it = this.parseExpr(); this.expect(')'); return { k: 'forin', name, iter: it, body: this.parseStmt(), assignOnly: true, ...P }; }
    let init = null;
    if (!this.at(';')) init = this.declAhead() ? this.parseVarDecl(false) : { k: 'expr', e: this.parseExpr() };
    this.expect(';', 'in the for loop header');
    let cond = null; if (!this.at(';')) cond = this.parseExpr();
    this.expect(';', 'in the for loop header');
    const updates: Node[] = [];
    while (!this.at(')')) { updates.push(this.parseExpr()); if (!this.eat(',')) break; }
    this.expect(')', 'to close the for loop header');
    return { k: 'for', init, cond, updates, body: this.parseStmt(), ...P };
  }

  parseSwitchStmt(e: Node, P: any): Node {
    const cases: { tests: Node[]; isDefault: boolean; body: Node[] }[] = [];
    while (!this.eat('}')) {
      const c = { tests: [] as Node[], isDefault: false, body: [] as Node[] };
      while (this.at('case') || this.at('default')) {
        if (this.eat('default')) { c.isDefault = true; this.expect(':'); }
        else { this.next(); c.tests.push(this.parsePattern()); if (this.at('when')) this.err('Guard clauses are not supported offline', this.peek(), true); this.expect(':', 'after the case pattern'); }
      }
      while (!this.at('case') && !this.at('default') && !this.at('}')) {
        if (this.peek().t === 'eof') this.err("Missing '}' to close switch");
        c.body.push(this.parseStmt());
      }
      cases.push(c);
    }
    return { k: 'switch', e, cases, ...P };
  }
  parsePattern(): Node {
    if (this.isId() && this.peek().v === '_' ) { this.next(); return { k: 'wild' }; }
    // type pattern: `int n` / `Circle c` / `Circle()`
    const save = this.i; const ty = this.tryType();
    if (ty && /^[A-Z]|^int$|^double$|^num$|^bool$/.test(ty.name) && this.at('(') && this.at(')', 1)) { this.next(); this.next(); return { k: 'typePat', type: ty }; }
    if (ty && this.isId() && /^[A-Z]|^int$|^double$|^String$|^num$|^bool$/.test(ty.name)) { const bind = this.ident(); return { k: 'typePat', type: ty, bind }; }
    this.i = save;
    let p = this.parseOr();
    while (this.at('||')) { this.next(); p = { k: 'orPat', a: p, b: this.parseOr() }; }
    return { k: 'constPat', e: p };
  }

  parseTry(): Node {
    const P = this.pos(); this.next();
    const body = this.parseBlock();
    const catches: Node[] = [];
    let fin = null;
    while (this.at('on') || this.at('catch')) {
      let type: TypeRef | null = null, ev: string | null = null, sv: string | null = null;
      if (this.eat('on')) type = this.tryType();
      if (this.eat('catch')) { this.expect('('); ev = this.ident(); if (this.eat(',')) sv = this.ident(); this.expect(')'); }
      catches.push({ type, ev, sv, body: this.parseBlock() });
    }
    if (this.eat('finally')) fin = this.parseBlock();
    if (!catches.length && !fin) this.err("A try block must be followed by 'on', 'catch' or 'finally'");
    return { k: 'try', body, catches, fin, ...P };
  }

  // ---------- expressions ----------
  parseExpr(): Node {
    let e = this.parseAssign();
    if (this.at('..') || this.at('?..')) {
      const sections: Node[] = [];
      while (this.eat('..')) {
        const P = this.pos();
        let node: Node;
        if (this.at('[')) { this.next(); const idx = this.parseExpr(); this.expect(']'); node = { k: 'index', obj: { k: 'cascadeTarget' }, idx, ...P }; }
        else node = { k: 'member', obj: { k: 'cascadeTarget' }, name: this.ident(), ...P };
        node = this.parsePostfixOps(node);
        const aop = this.peek();
        if (aop.t === 'op' && ['=', '+=', '-=', '*=', '/=', '??=', '%=', '~/='].includes(aop.v)) { this.next(); node = { k: 'assign', op: aop.v, target: node, value: this.parseAssign(), ...P }; }
        sections.push(node);
      }
      e = { k: 'cascade', target: e, sections };
    }
    return e;
  }
  parseAssign(): Node {
    const P = this.pos();
    const lhs = this.parseConditional();
    const t = this.peek();
    if (t.t === 'op' && ['=', '+=', '-=', '*=', '/=', '??=', '%=', '~/='].includes(t.v)) {
      if (!['id', 'member', 'index', 'nullMember'].includes(lhs.k)) this.err('The left side of an assignment must be a variable, field or index', t);
      this.next();
      return { k: 'assign', op: t.v, target: lhs, value: this.parseAssign(), ...P };
    }
    return lhs;
  }
  parseConditional(): Node {
    const P = this.pos();
    const c = this.parseIfNull();
    if (this.at('?')) {
      this.next(); const a = this.parseAssign(); this.expect(':', "in the conditional expression (cond ? a : b)"); const b = this.parseAssign();
      return { k: 'cond', c, a, b, ...P };
    }
    return c;
  }
  parseIfNull(): Node { let l = this.parseOr(); while (this.at('??')) { const P = this.pos(); this.next(); l = { k: 'bin', op: '??', l, r: this.parseOr(), ...P }; } return l; }
  parseOr(): Node { let l = this.parseAnd(); while (this.at('||')) { const P = this.pos(); this.next(); l = { k: 'bin', op: '||', l, r: this.parseAnd(), ...P }; } return l; }
  parseAnd(): Node { let l = this.parseEq(); while (this.at('&&')) { const P = this.pos(); this.next(); l = { k: 'bin', op: '&&', l, r: this.parseEq(), ...P }; } return l; }
  parseEq(): Node {
    let l = this.parseRel();
    if (this.at('==') || this.at('!=')) { const P = this.pos(); const op = this.next().v; l = { k: 'bin', op, l, r: this.parseRel(), ...P }; }
    return l;
  }
  parseRel(): Node {
    let l = this.parseBitOr();
    const P = this.pos();
    if (this.at('<') || this.at('>') || this.at('<=') || this.at('>=')) { const op = this.next().v; return { k: 'bin', op, l, r: this.parseBitOr(), ...P }; }
    if (this.at('is')) { this.next(); const neg = this.eat('!'); const type = this.tryType(); if (!type) this.err("Expected a type after 'is'"); return { k: 'is', e: l, type, neg, ...P }; }
    if (this.at('as')) { this.next(); const type = this.tryType(); if (!type) this.err("Expected a type after 'as'"); l = { k: 'as', e: l, type, ...P }; }
    return l;
  }
  parseBitOr(): Node {
    let l = this.parseAdd();
    while (this.at('&') || this.at('|') || this.at('^')) { const P = this.pos(); const op = this.next().v; l = { k: 'bin', op, l, r: this.parseAdd(), ...P }; }
    return l;
  }
  parseAdd(): Node { let l = this.parseMul(); while (this.at('+') || this.at('-')) { const P = this.pos(); const op = this.next().v; l = { k: 'bin', op, l, r: this.parseMul(), ...P }; } return l; }
  parseMul(): Node { let l = this.parseUnary(); while (this.at('*') || this.at('/') || this.at('%') || this.at('~/')) { const P = this.pos(); const op = this.next().v; l = { k: 'bin', op, l, r: this.parseUnary(), ...P }; } return l; }
  parseUnary(): Node {
    const P = this.pos();
    if (this.at('-')) { this.next(); return { k: 'neg', e: this.parseUnary(), ...P }; }
    if (this.at('!')) { this.next(); return { k: 'not', e: this.parseUnary(), ...P }; }
    if (this.at('~')) { this.next(); return { k: 'bnot', e: this.parseUnary(), ...P }; }
    if (this.at('++') || this.at('--')) { const op = this.next().v; return { k: 'preinc', op, target: this.parseUnary(), ...P }; }
    if (this.at('await')) { this.next(); return { k: 'await', e: this.parseUnary(), ...P }; }
    return this.parsePostfix();
  }
  parsePostfix(): Node { return this.parsePostfixOps(this.parsePrimary()); }
  parsePostfixOps(e: Node): Node {
    for (;;) {
      const P = this.pos();
      if (this.at('.')) { this.next(); e = { k: 'member', obj: e, name: this.ident('a member name'), ...P }; continue; }
      if (this.at('?.')) { this.next(); e = { k: 'nullMember', obj: e, name: this.ident('a member name'), ...P }; continue; }
      if (this.at('<') && this.isGenericCall()) { this.skipBalanced('<', '>'); continue; }
      if (this.at('(')) { const a = this.parseArgs(); e = { k: 'call', fn: e, ...a, ...P }; continue; }
      if (this.at('[')) { this.next(); const idx = this.parseExpr(); this.expect(']'); e = { k: 'index', obj: e, idx, ...P }; continue; }
      if (this.at('?') && this.at('[', 1)) { this.next(); this.next(); const idx = this.parseExpr(); this.expect(']'); e = { k: 'index', obj: e, idx, nullSafe: true, ...P }; continue; }
      if (this.at('!') ) { this.next(); e = { k: 'nonNull', e, ...P }; continue; }
      if (this.at('++') || this.at('--')) { const op = this.next().v; e = { k: 'postinc', op, target: e, ...P }; continue; }
      return e;
    }
  }
  isGenericCall(): boolean {
    // foo<int>(...) — scan for matching '>' followed by '('
    let j = this.i + 1, depth = 1;
    while (j < this.toks.length && j < this.i + 20) {
      const t = this.toks[j];
      if (t.t === 'op' && t.v === '<') depth++;
      else if (t.t === 'op' && t.v === '>') { depth--; if (depth === 0) return this.toks[j + 1]?.t === 'op' && (this.toks[j + 1].v === '(' || this.toks[j + 1].v === '.'); }
      else if (!(t.t === 'id' || (t.t === 'op' && (t.v === ',' || t.v === '?')) || t.v === 'void')) return false;
      j++;
    }
    return false;
  }
  parseArgs(): { args: Node[]; named: [string, Node][]; namedPos: { name: string; nameOff: number; s: number; e: number }[]; argPos: { s: number; e: number }[]; aStart: number; aEnd: number } {
    const open = this.expect('(');
    const args: Node[] = []; const named: [string, Node][] = [];
    const namedPos: { name: string; nameOff: number; s: number; e: number }[] = []; const argPos: { s: number; e: number }[] = [];
    while (!this.at(')')) {
      if (this.isId() && this.at(':', 1)) {
        const nt = this.next(); this.next();
        const s0 = this.peek().pos ?? 0;
        named.push([nt.v, this.parseExpr()]);
        namedPos.push({ name: nt.v, nameOff: nt.pos ?? 0, s: s0, e: this.toks[this.i - 1].end ?? 0 });
      } else {
        const s0 = this.peek().pos ?? 0;
        args.push(this.parseExpr());
        argPos.push({ s: s0, e: this.toks[this.i - 1].end ?? 0 });
      }
      if (!this.eat(',')) break;
    }
    const close = this.expect(')', 'to close the argument list');
    return { args, named, namedPos, argPos, aStart: open.pos ?? 0, aEnd: close.pos ?? 0 };
  }

  lambdaAhead(): boolean {
    // at '(' : find matching ')' then check for '=>' or '{' or async
    let j = this.i, depth = 0;
    for (; j < this.toks.length; j++) {
      const t = this.toks[j];
      if (t.t === 'op' && (t.v === '(' )) depth++;
      if (t.t === 'op' && t.v === ')') { depth--; if (depth === 0) break; }
      if (t.t === 'eof') return false;
    }
    const n = this.toks[j + 1];
    return !!n && ((n.t === 'op' && (n.v === '=>' || n.v === '{')) || (n.t === 'kw' && n.v === 'async'));
  }

  parsePrimary(): Node {
    const t = this.peek();
    const P = this.pos(t);
    if (t.t === 'num') { this.next(); return { k: 'num', v: Number(t.v), isDouble: !!t.isDouble, ...P }; }
    if (t.t === 'str') {
      let node = this.strNode(this.next());
      while (this.peek().t === 'str') node = { k: 'interp', parts: [node, this.strNode(this.next())], ...P };
      return node;
    }
    if (t.t === 'kw') {
      switch (t.v) {
        case 'true': this.next(); return { k: 'bool', v: true, ...P };
        case 'false': this.next(); return { k: 'bool', v: false, ...P };
        case 'null': this.next(); return { k: 'null', ...P };
        case 'this': this.next(); return { k: 'this', ...P };
        case 'super': this.next(); return { k: 'super', ...P };
        case 'const': this.next(); return { k: 'constExpr', e: this.parsePostfix(), ...P };
        case 'new': this.next(); return this.parsePrimary();
        case 'throw': this.next(); return { k: 'throw', e: this.parseAssign(), ...P };
        case 'switch': return this.parseSwitchExpr();
      }
    }
    if (this.at('(')) {
      if (this.lambdaAhead()) {
        const params = this.parseParams();
        const { body, isAsync } = this.parseLambdaBody();
        return { k: 'lambda', params, body, isAsync, ...P };
      }
      this.next(); const e = this.parseExpr(); this.expect(')', 'to close the parenthesis'); return { k: 'paren', e, ...P };
    }
    if (this.at('<')) { // typed collection literal
      this.next(); const types: TypeRef[] = []; do { const ty = this.tryType(); if (ty) types.push(ty); } while (this.eat(',')); this.expect('>');
      if (this.at('[')) return this.parseList();
      if (this.at('{')) return this.parseMapOrSet(types.length === 2 ? 'map' : 'set');
      this.err('Expected a list or map literal after type arguments');
    }
    if (this.at('[')) return this.parseList();
    if (this.at('{')) return this.parseMapOrSet(null);
    if (this.isId()) { this.next(); return { k: 'id', name: t.v, ...P }; }
    if (t.t === 'eof') this.err('Unexpected end of code — a closing bracket or semicolon is probably missing', t);
    if (t.t === 'op' && t.v === '#') this.err('Symbols (#name) are not supported offline', t, true);
    this.err(`Unexpected '${t.v}' — expected an expression`, t);
  }
  parseLambdaBody(): { body: Node; isAsync: boolean } {
    let isAsync = false;
    if (this.eat('async')) isAsync = true;
    if (this.eat('=>')) return { body: { k: 'arrow', e: this.parseAssign() }, isAsync };
    return { body: this.parseBlock(), isAsync };
  }
  strNode(t: Tok): Node {
    const parts = t.parts || [t.v];
    if (parts.length === 1 && typeof parts[0] === 'string') return { k: 'str', v: parts[0], line: t.line, col: t.col };
    return {
      k: 'interp', line: t.line, col: t.col,
      parts: parts.map((p) => {
        if (typeof p === 'string') return { k: 'str', v: p };
        const sub = new Parser(p.code, p.line, p.col);
        const e = sub.parseExpr();
        if (sub.peek().t !== 'eof') sub.err(`Unexpected '${sub.peek().v}' inside string interpolation`);
        return e;
      }),
    };
  }
  parseElement(): Node {
    const P = this.pos();
    if (this.at('...') || this.at('...?')) { const nullAware = this.next().v === '...?'; return { k: 'spread', e: this.parseExpr(), nullAware, ...P }; }
    if (this.at('if')) {
      this.next(); this.expect('('); const cond = this.parseExpr(); this.expect(')');
      const then = this.parseElement(); let els = null; if (this.eat('else')) els = this.parseElement();
      return { k: 'ifElem', cond, then, els, ...P };
    }
    if (this.at('for')) {
      this.next(); this.expect('(');
      const save = this.i;
      if (this.at('var') || this.at('final')) this.next(); else { const s = this.i; const ty = this.tryType(); if (!(ty && this.isId())) this.i = s; }
      if (this.isId() && this.at('in', 1)) {
        const name = this.ident(); this.expect('in'); const iter = this.parseExpr(); this.expect(')');
        return { k: 'forElem', name, iter, body: this.parseElement(), ...P };
      }
      this.i = save;
      let init = null;
      if (!this.at(';')) init = this.declAhead() ? this.parseVarDecl(false) : { k: 'expr', e: this.parseExpr() };
      this.expect(';'); let cond = null; if (!this.at(';')) cond = this.parseExpr(); this.expect(';');
      const updates: Node[] = []; while (!this.at(')')) { updates.push(this.parseExpr()); if (!this.eat(',')) break; }
      this.expect(')');
      return { k: 'forClassicElem', init, cond, updates, body: this.parseElement(), ...P };
    }
    const e = this.parseExpr();
    if (this.at(':')) { this.next(); return { k: 'entry', key: e, value: this.parseExpr(), ...P }; }
    return e;
  }
  parseList(): Node {
    const P = this.pos(); this.expect('[');
    const items: Node[] = [];
    while (!this.at(']')) { items.push(this.parseElement()); if (!this.eat(',')) break; }
    this.expect(']', 'to close the list literal');
    return { k: 'list', items, ...P };
  }
  parseMapOrSet(kind: 'map' | 'set' | null): Node {
    const P = this.pos(); this.expect('{');
    const items: Node[] = [];
    while (!this.at('}')) { items.push(this.parseElement()); if (!this.eat(',')) break; }
    this.expect('}', 'to close the map/set literal');
    const isMap = kind === 'map' || (kind === null && (items.length === 0 || items.some((x) => x.k === 'entry' || (x.k === 'ifElem' && x.then.k === 'entry'))));
    return { k: isMap ? 'map' : 'set', items, ...P };
  }
  parseSwitchExpr(): Node {
    const P = this.pos(); this.next(); this.expect('('); const e = this.parseExpr(); this.expect(')'); this.expect('{');
    const arms: { pat: Node; e: Node }[] = [];
    while (!this.at('}')) {
      const pat = this.parsePattern();
      this.expect('=>', 'in the switch expression arm');
      arms.push({ pat, e: this.parseExpr() });
      if (!this.eat(',')) break;
    }
    this.expect('}');
    return { k: 'switchExpr', e, arms, ...P };
  }
}

export function parseProgram(src: string): Node { return new Parser(src).parseProgram(); }
export function parseExpression(src: string): Node {
  const p = new Parser(src); const e = p.parseExpr();
  if (p.peek().t !== 'eof') p.err(`Unexpected '${p.peek().v}' after expression`);
  return e;
}
