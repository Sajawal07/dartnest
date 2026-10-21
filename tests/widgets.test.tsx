import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Interpreter } from '../src/engine/runtime';
import { installFlutter, resolveRoot, walk, type RNode } from '../src/engine/flutter';
import { UiDriver, runSteps } from '../src/engine/harness';
import { PreviewSurface } from '../src/ui/Preview';
import { applyProp, propStatus, INSPECTABLE } from '../src/engine/sourceEdit';
import { NObj } from '../src/engine/values';
import { navMode, workspaceLayout, previewScale, isLandscapePhone } from '../src/ui/layout';

const M = "import 'package:flutter/material.dart';\n\n";
function boot(code: string) { const I = new Interpreter(code); I.hooks.installFlutter = installFlutter; I.load(); I.runMain(); return I; }
function html(I: Interpreter, reducedMotion = false) { const tree = resolveRoot(I, { width: 360, height: 640 }); return renderToString(<PreviewSurface tree={tree} api={{ interp: I, fire: () => {}, inspect: false, selected: null, select: () => {}, reducedMotion }} />); }
const find = (tree: RNode | null, type: string) => { const out: RNode[] = []; walk(tree, (n) => { if (n.type === type) out.push(n); }); return out; };

const ALL_TARGETS = `${M}void main() {
  runApp(MaterialApp(home: Scaffold(body: Column(children: [
    const Text('Hello', style: TextStyle(fontSize: 20, color: Colors.red)),
    const Icon(Icons.star, size: 30),
    Container(width: 150, height: 60, padding: const EdgeInsets.all(8), margin: const EdgeInsets.all(4), alignment: Alignment.center,
      decoration: BoxDecoration(color: Colors.blue, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.black, width: 2)), child: const Text('Box')),
    const Padding(padding: EdgeInsets.all(8), child: SizedBox(width: 40, height: 10)),
    const Center(child: Text('C')), const Align(alignment: Alignment.topRight, child: Text('A')),
    Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.start, children: const [Expanded(child: Text('E')), Flexible(child: Text('F')), Spacer()]),
    const Card(child: ListTile(title: Text('Tile'), subtitle: Text('Sub'))), const Divider(),
    Stack(children: const [SizedBox(width: 50, height: 50), Positioned(top: 0, child: Text('S'))]),
    ElevatedButton(onPressed: () {}, child: const Text('Elevated')), TextButton(onPressed: () {}, child: const Text('TextBtn')), OutlinedButton(onPressed: () {}, child: const Text('Outlined')),
    const TextField(), Checkbox(value: true, onChanged: (v) {}), Switch(value: false, onChanged: (v) {}),
    DropdownButton<String>(value: 'a', items: const [DropdownMenuItem(value: 'a', child: Text('A1'))], onChanged: (v) {}),
    SizedBox(height: 100, child: ListView.builder(itemCount: 3, itemBuilder: (context, i) => Text('Item $i'))),
  ]))));
}`;

describe('Widget preview renderer', () => {
  it('renders every initial target widget with common properties', () => {
    const I = boot(ALL_TARGETS);
    const tree = resolveRoot(I, { width: 360, height: 640 });
    for (const t of ['Text', 'Icon', 'Container', 'Padding', 'SizedBox', 'Center', 'Align', 'Row', 'Column', 'Expanded', 'Flexible', 'Spacer', 'Card', 'ListTile', 'Divider', 'Stack', 'ElevatedButton', 'TextButton', 'OutlinedButton', 'TextField', 'Checkbox', 'Switch', 'DropdownButton', 'ListView']) expect(find(tree, t).length, t).toBeGreaterThan(0);
    expect(find(tree, 'ListView')[0].slots.children).toHaveLength(3);
    const h = html(I);
    for (const s of ['width:150px', 'height:60px', 'border-radius:12px', 'border:2px solid', 'font-size:20px', 'justify-content:space-between', 'align-items:flex-start', 'Item 2', 'A1']) expect(h, s).toContain(s);
  });
  it('button interactions update state through setState', () => {
    const I = boot(`${M}void main() { runApp(const MaterialApp(home: Scaffold(body: C()))); }
class C extends StatefulWidget { const C({super.key}); @override State<C> createState() => _S(); }
class _S extends State<C> { int n = 0; bool on = false; String sel = 'x';
  @override Widget build(BuildContext context) => Column(children: [Text('n=$n on=$on sel=$sel'), ElevatedButton(onPressed: () => setState(() => n++), child: const Text('Inc')),
    Switch(value: on, onChanged: (v) => setState(() => on = v)),
    DropdownButton<String>(value: sel, items: const [DropdownMenuItem(value: 'x', child: Text('X')), DropdownMenuItem(value: 'y', child: Text('Y'))], onChanged: (v) => setState(() => sel = v!)),
    TextField(onChanged: (v) => setState(() => sel = v))]); }`);
    const d = new UiDriver(I);
    expect(d.tap('Inc')).toBeNull(); expect(d.tap('Inc')).toBeNull();
    expect(d.toggle(0)).toBeNull();
    expect(d.texts()).toContain('n=2 on=true sel=x');
    expect(d.enter(0, 'typed')).toBeNull();
    expect(d.texts()).toContain('n=2 on=true sel=typed');
    expect(runSteps(boot(I.program as any), [['select', 0, 'y'], ['text', 'sel=y']]).ok).toBe(true);
  });
  it('state survives rebuilds; removed State objects are disposed', () => {
    const I = boot(`${M}void main() { runApp(const MaterialApp(home: Scaffold(body: P()))); }
class P extends StatefulWidget { const P({super.key}); @override State<P> createState() => _P(); }
class _P extends State<P> { bool show = true; @override Widget build(BuildContext context) => Column(children: [TextButton(onPressed: () => setState(() => show = !show), child: const Text('T')), if (show) const K()]); }
class K extends StatefulWidget { const K({super.key}); @override State<K> createState() => _K(); }
class _K extends State<K> { @override void dispose() { print('disposed'); super.dispose(); } @override Widget build(BuildContext context) => const Text('child'); }`);
    const d = new UiDriver(I);
    d.tap('T');
    expect(I.output).toContain('disposed');
    expect(d.texts()).not.toContain('child');
  });
  it('setState after dispose is reported', () => {
    let thrown: any = null;
    try { runSteps(boot(`${M}void main() { runApp(const MaterialApp(home: Scaffold(body: P()))); }
class P extends StatefulWidget { const P({super.key}); @override State<P> createState() => _P(); }
class _P extends State<P> { @override Widget build(BuildContext context) => TextButton(onPressed: () { dispose(); mounted = false; setState(() {}); }, child: const Text('Go')); }`), [['tap', 'Go']]); } catch (e) { thrown = e; }
    expect(String(thrown?.value?.fields?.get('message'))).toMatch(/setState\(\) called after dispose/);
  });
  it('unsupported widgets and invalid arguments generate explicit diagnostics', () => {
    const e1 = (() => { try { boot(`${M}void main() { runApp(CupertinoButton(child: Text('x'))); }`); return ''; } catch (e: any) { return e.message; } })();
    expect(e1).toMatch(/Undefined name 'CupertinoButton'/);
    const e2 = (() => { try { boot(`${M}void main() { runApp(MaterialApp(home: Text(42))); }`); return ''; } catch (e: any) { return e.message; } })();
    expect(e2).toMatch(/Text\(\) expects a String/);
    const e3 = (() => { try { boot(`${M}void main() { runApp(Container(color: Colors.red, decoration: BoxDecoration())); }`); return ''; } catch (e: any) { return String(e.value?.fields?.get('message') ?? e.message); } })();
    expect(e3).toMatch(/Cannot provide both a color and a decoration/);
    const e4 = (() => { try { boot(`${M}void main() { runApp(Text('x', fontSize: 3)); }`); return ''; } catch (e: any) { return e.message; } })();
    expect(e4).toMatch(/No named parameter with the name 'fontSize'/);
  });
  it('reduced motion removes preview transitions', () => {
    const I = boot(`${M}void main() { runApp(const MaterialApp(home: AnimatedContainer(duration: Duration(milliseconds: 300), width: 10))); }`);
    expect(html(I, false)).toContain('transition:all 300ms');
    expect(html(I, true)).not.toContain('transition:all');
  });
  it('navigation keeps underlying routes mounted', () => {
    const r = runSteps(boot(`${M}void main() { runApp(const MaterialApp(home: H())); }
class H extends StatefulWidget { const H({super.key}); @override State<H> createState() => _H(); }
class _H extends State<H> { int n = 0; @override Widget build(BuildContext context) => Scaffold(body: Column(children: [Text('n=$n'), TextButton(onPressed: () => setState(() => n++), child: const Text('Inc')), TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => Scaffold(body: TextButton(onPressed: () => Navigator.pop(context), child: const Text('Back'))))), child: const Text('Go'))])); }`),
      [['tap', 'Inc'], ['tap', 'Go'], ['notext', 'n=1'], ['tap', 'Back'], ['text', 'n=1']]);
    expect(r).toEqual({ ok: true, detail: 'All checks passed.' });
  });
});

describe('Interactive property inspector (two-way source sync)', () => {
  const SRC = `${M}void main() {
  runApp(MaterialApp(home: Scaffold(body: Column(children: [
    Container(width: 150, padding: const EdgeInsets.all(8), color: Colors.red, child: const Text('Hi', style: TextStyle(fontSize: 14))),
    Container(width: big ? 200 : 100),
    for (var i = 0; i < 2; i++) const Icon(Icons.star),
  ]))));
}
const big = true;`;
  const selectFirst = (code: string, type: string) => { const I = boot(code); const tree = resolveRoot(I, { width: 360, height: 640 }); return find(tree, type)[0]; };
  const spec = (w: string, key: string) => INSPECTABLE[w].find((s) => s.key === key)!;
  const callOf = (n: RNode) => (n.src as NObj).src;

  it('changing width 150 → 220 rewrites only that literal and re-renders', () => {
    const c = selectFirst(SRC, 'Container');
    const r = applyProp(SRC, callOf(c), spec('Container', 'width'), 220);
    expect(r.ok).toBe(true);
    const code = (r as any).code as string;
    expect(code).toContain('Container(width: 220, padding');
    expect(code.replace('220', '150')).toBe(SRC);
    expect(selectFirst(code, 'Container').props.width).toBe(220);
  });
  it('adjusts padding, alignment and text style; inserts missing properties', () => {
    let code = SRC;
    let r: any = applyProp(code, callOf(selectFirst(code, 'Container')), spec('Container', 'padding'), 24); code = r.code;
    expect(code).toContain('padding: EdgeInsets.all(24)');
    r = applyProp(code, callOf(selectFirst(code, 'Container')), spec('Container', 'alignment'), 'bottomRight'); code = r.code;
    expect(code).toContain('alignment: Alignment.bottomRight');
    r = applyProp(code, callOf(selectFirst(code, 'Text')), INSPECTABLE.Text[1], 22); code = r.code;
    expect(code).toContain('TextStyle(fontSize: 22)');
    r = applyProp(code, callOf(selectFirst(code, 'Text')), INSPECTABLE.Text[0], "It's"); code = r.code;
    expect(code).toContain("Text('It\\'s'");
    expect(boot(code).rootWidget).toBeTruthy();
  });
  it('border radius moves the colour into a new BoxDecoration (avoids the color+decoration assertion)', () => {
    const r: any = applyProp(SRC, callOf(selectFirst(SRC, 'Container')), spec('Container', 'borderRadius'), 16);
    expect(r.code).toContain('decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(16))');
    expect(r.code).not.toMatch(/color: Colors\.red, (width|child)/);
    const c = selectFirst(r.code, 'Container');
    expect(c.props.decoration.props.borderRadius.props.r).toBe(16);
    const r2: any = applyProp(r.code, callOf(c), spec('Container', 'color'), 'teal');
    expect(r2.code).toContain('BoxDecoration(color: Colors.teal');
  });
  it('expression-valued properties are read-only with an explanation', () => {
    const I = boot(SRC); const tree = resolveRoot(I, { width: 360, height: 640 });
    const second = find(tree, 'Container')[1];
    const st = propStatus(callOf(second), spec('Container', 'width'));
    expect(st.editable).toBe(false); expect(st.reason).toMatch(/expression/);
    expect(applyProp(SRC, callOf(second), spec('Container', 'width'), 5).ok).toBe(false);
  });
  it('widgets created in a loop share one source call', () => {
    const I = boot(SRC); const icons = find(resolveRoot(I, { width: 360, height: 640 }), 'Icon');
    expect(icons).toHaveLength(2);
    expect(callOf(icons[0])).toBe(callOf(icons[1]));
  });
});

describe('Responsive layout rules', () => {
  it('bottom navigation on phones, rail on large screens', () => { expect(navMode(360)).toBe('bottom'); expect(navMode(800)).toBe('bottom'); expect(navMode(1280)).toBe('rail'); });
  it('editor and preview stack on phones and split on wide screens', () => { expect(workspaceLayout(390)).toBe('stacked'); expect(workspaceLayout(1200)).toBe('split'); });
  it('preview scales down to fit but never up', () => { expect(previewScale(300, 360)).toBeCloseTo(0.8, 1); expect(previewScale(1000, 360)).toBe(1); expect(previewScale(100, 600)).toBe(0.5); });
  it('detects phone landscape', () => { expect(isLandscapePhone(800, 380)).toBe(true); expect(isLandscapePhone(380, 800)).toBe(false); });
});
