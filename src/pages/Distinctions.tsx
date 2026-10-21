import { useState } from 'react';
import { Card, Badge, CodeBlock, Btn } from '../ui/kit';
import { exampleCategory, CATEGORY_INFO } from '../data/contentDb';
import { go } from '../ui/router';

const M = "import 'package:flutter/material.dart';\n\n";
export const DISTINCTIONS: { a: string; b: string; text: string; code: string; lesson: number }[] = [
  { a: 'Widget configuration', b: 'Mutable state', lesson: 18, text: 'A widget is an immutable description, rebuilt cheaply and often. A StatefulWidget is itself immutable. It creates a separate, long-lived State object that holds the changing values. setState() mutates that State and schedules a rebuild, which produces new widget configurations.', code: `${M}class Counter extends StatefulWidget {\n  const Counter({super.key}); // immutable configuration\n  @override\n  State<Counter> createState() => _CounterState();\n}\n\nclass _CounterState extends State<Counter> {\n  int count = 0; // mutable state lives here\n  @override\n  Widget build(BuildContext context) => ElevatedButton(\n        onPressed: () => setState(() => count++),\n        child: Text('Count: $count'),\n      );\n}\n\nvoid main() {\n  runApp(const MaterialApp(home: Scaffold(body: Center(child: Counter()))));\n}\n` },
  { a: 'Synchronous execution', b: 'Asynchronous execution', lesson: 46, text: 'Synchronous code runs to completion before the next line. Asynchronous code returns a Future at once and finishes later. await suspends only the current async function, never the UI thread. CPU-heavy synchronous work still blocks frames and needs an isolate. (The offline engine resolves Futures in program order: it models async control flow, not real timing.)', code: "Future<String> load() async {\n  await Future.delayed(const Duration(milliseconds: 100));\n  return 'data';\n}\n\nvoid main() async {\n  print('1: sync');\n  final f = load(); // returns a Future immediately\n  print('2: got a ${f.runtimeType}');\n  print('3: ${await f}');\n}\n" },
  { a: 'Local (ephemeral) state', b: 'Application state', lesson: 59, text: 'Local state belongs to one widget (a selected tab, a text field\'s content) and uses setState. Application state is shared across screens or sessions (the user, the cart, settings). It lives above the widgets that use it, in a ChangeNotifier, Riverpod or a repository.', code: "class Cart {\n  final items = <String>[]; // app state: shared by many screens\n}\n\nvoid main() {\n  final cart = Cart();\n  var selectedTab = 0; // local state: one widget only\n  cart.items.add('Lamp');\n  selectedTab = 1;\n  print('${cart.items} tab=$selectedTab');\n}\n" },
  { a: 'UI code', b: 'Business logic', lesson: 64, text: 'UI code decides how things look and how input is collected. Business logic decides what is allowed and what the result is: validation rules, prices, permissions. Keep rules in plain Dart classes, such as use cases and services, so they can be unit-tested without widgets.', code: "// Business logic: pure, testable\nString? validateTitle(String t) => t.trim().isEmpty ? 'Title is required' : null;\n\nvoid main() {\n  // The UI only displays the result\n  print(validateTitle('  ') ?? 'ok');\n  print(validateTitle('Ship') ?? 'ok');\n}\n" },
  { a: 'A function', b: 'A method', lesson: 13, text: 'A function is declared at top level or locally and called directly. A method is a function that belongs to a class and runs with access to an instance (this) or the class (static). Both are first-class values: you can pass a method tear-off like counter.increment as a callback.', code: "int square(int x) => x * x; // top-level function\n\nclass Counter {\n  int value = 0;\n  void increment() => value++; // method: uses this.value\n}\n\nvoid main() {\n  final c = Counter();\n  c.increment();\n  print('${square(4)} ${c.value}');\n}\n" },
  { a: 'A callback', b: 'A returned value', lesson: 10, text: 'Passing save gives the widget a function to call later. Writing save() calls it now and passes its return value. onPressed needs the function itself (or a lambda), not the result of calling it.', code: "void save() => print('saved');\n\nvoid main() {\n  final callback = save; // a function value, not called yet\n  print('before');\n  callback(); // called later, when the event happens\n}\n" },
  { a: 'A widget tree', b: 'A rendered interface', lesson: 76, text: 'The widget tree is a description. Flutter turns it into elements (identity and state), then render objects that lay out and paint. The pixels you see are the output of that pipeline. This academy\'s preview draws an approximation with its own renderer, which is not the native Flutter engine.', code: `${M}void main() {\n  // A description: Column → [Text, Text]\n  runApp(const MaterialApp(home: Scaffold(body: Column(children: [Text('Title'), Text('Subtitle')]))));\n}\n` },
  { a: 'Local persistence', b: 'Remote storage', lesson: 55, text: 'Local persistence (files, SQLite, key-value stores) lives on the device: it is instant, works offline, and is lost if the app is uninstalled. Remote storage lives on a server: it can be shared across devices but needs a network, authentication and sync. Offline-first apps write locally first and sync later.', code: "import 'dart:convert';\n\nvoid main() {\n  final local = <String, String>{}; // stands in for on-device storage\n  local['tasks'] = jsonEncode(['Plan', 'Ship']);\n  print(jsonDecode(local['tasks']!));\n}\n" },
  { a: 'Syntax validation', b: 'Actual execution', lesson: 112, text: 'A parser can confirm that code is well-formed without knowing whether it works. Execution runs it and observes behaviour. This academy grades practicals by executing your code against test cases, never by checking for keywords.', code: "int add(int a, int b) {\n  return a - b; // syntactically valid, logically wrong\n}\n\nvoid main() {\n  print(add(2, 3) == 5 ? 'pass' : 'fails when executed');\n}\n" },
  { a: 'A passing screenshot', b: 'Verified functionality', lesson: 102, text: 'A UI can look right and still be broken: the button may do nothing, or state may not update. Verified functionality means interacting with it (tap, type, toggle) and asserting the results, as widget tests and this app\'s practical grader do.', code: `${M}void main() {\n  // Looks like a working button, but onPressed does nothing.\n  runApp(MaterialApp(home: Scaffold(body: Center(child: ElevatedButton(onPressed: () {}, child: const Text('Add to cart'))))));\n}\n` },
];

export function DistinctionsPage() {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-4 max-w-4xl">
      <header><h1 className="text-2xl font-bold">Core distinctions</h1><p className="text-sm text-[var(--muted)]">Ten pairs of concepts that beginners often blur, with precise explanations and labelled examples.</p></header>
      <Card className="text-xs text-[var(--muted)] space-y-1"><b className="text-[var(--fg)]">How code is labelled throughout the academy</b>{Object.values(CATEGORY_INFO).map((c) => <div key={c.label}><Badge tone={c.tone}>{c.label}</Badge> {c.help}</div>)}</Card>
      {DISTINCTIONS.map((d, i) => {
        const cat = exampleCategory(d.code);
        return <Card key={i} className="space-y-3">
          <button className="w-full flex items-center gap-2 text-left" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
            <span className="font-semibold">{d.a}</span><span className="text-[var(--muted)]">vs</span><span className="font-semibold">{d.b}</span>
            <span className={`ml-auto text-[var(--muted)] transition ${open === i ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {open === i && <div className="space-y-3 anim-fade">
            <p className="text-[15px] leading-relaxed">{d.text}</p>
            <Badge tone={CATEGORY_INFO[cat].tone}>{CATEGORY_INFO[cat].label}</Badge>
            <CodeBlock code={d.code} />
            <div className="flex gap-2">{cat === 'interpreter' && <Btn onClick={() => { sessionStorage.setItem('lab-load', d.code); go('/lab'); }}>Run in Code Lab</Btn>}<Btn kind="ghost" onClick={() => go(`/lesson/${d.lesson}`)}>Related lesson {d.lesson} →</Btn></div>
          </div>}
        </Card>;
      })}
    </div>
  );
}
