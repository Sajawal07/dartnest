// Project-based learning: 15 progressive projects. Every milestone is a TaskDef graded by the
// deterministic harness; reference solutions are verified by the automated test suite.
import type { TaskDef, LogicTest, UiTest, Step } from '../engine/harness';
import { TASKS, M, appWrap, scaffold, stateful, UI_STARTER } from './tasks';

export type Level = 'Beginner' | 'Intermediate' | 'Advanced';
export interface Project { id: string; title: string; level: Level; summary: string; unlockAfter: number; requirements: string[]; milestones: { task: TaskDef; weight: number }[]; rubric: string[]; capstone?: boolean; skills: string[] }

const ui = (id: string, title: string, statement: string, solution: string, tests: [string, Step[]][], hints: string[], starter = UI_STARTER): TaskDef => ({
  id, title, kind: 'ui', statement, expected: tests.map(([n]) => n).join('; '), io: 'A complete Flutter program whose main() calls runApp().',
  constraints: 'Use only widgets from the preview allow-list. Match the labels in the statement exactly — the acceptance tests tap and read them.', allowed: 'Supported Flutter widgets, StatelessWidget, StatefulWidget/setState, Navigator', starter, solution, hints,
  tests: tests.map(([name, steps]): UiTest => ({ name, steps })),
});
const logic = (id: string, title: string, fn: string, io: string, statement: string, starter: string, solution: string, tests: [string, string][], hints: string[]): TaskDef => ({
  id, title, kind: 'logic', fn, statement, io, expected: tests.slice(0, 3).map(([e, x]) => `${e} → ${x}`).join('; '),
  constraints: 'Pure Dart in the supported subset; return values instead of printing.', allowed: 'Dart core, collections, classes, dart:convert where imported', starter, solution, hints,
  tests: tests.map(([expr, expect]): LogicTest => ({ expr, expect })),
});

// ---------------- Beginner ----------------
const profileCard = ui('pc1', 'Profile card layout', "Build a centred Card containing a CircleAvatar (initials 'AL'), the name 'Ada Lovelace', the role 'Mathematician' and a Row with exactly two icons: Icons.email and Icons.phone.",
  scaffold(`const Center(
          child: Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(radius: 36, child: Text('AL')),
                  SizedBox(height: 8),
                  Text('Ada Lovelace', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                  Text('Mathematician'),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [Icon(Icons.email), SizedBox(width: 12), Icon(Icons.phone)],
                  ),
                ],
              ),
            ),
          ),
        )`),
  [['Card with avatar', [['has', 'Card'], ['has', 'CircleAvatar']]], ['Name and role inside the card', [['within', 'Card', 'Ada Lovelace'], ['within', 'Card', 'Mathematician']]], ['Two contact icons', [['has', 'Icon', 2], ['prop', 'Icon', 'icon.name', 'email'], ['prop', 'Icon', 'icon.name', 'phone']]]],
  ['Card → Padding → Column(mainAxisSize: MainAxisSize.min) keeps the card compact.']);
const followCard = ui('pc2', 'Follow button with counter', "Show 'Ada Lovelace', a Text 'Followers: 120' and an ElevatedButton whose label is 'Follow'. Tapping it switches the label to 'Following' and increments followers; tapping again reverts both.",
  stateful('ProfileCard', '  bool following = false;\n  int followers = 120;', `Card(
      child: Column(
        children: [
          const Text('Ada Lovelace'),
          Text('Followers: $followers'),
          ElevatedButton(
            onPressed: () => setState(() {
              following = !following;
              followers += following ? 1 : -1;
            }),
            child: Text(following ? 'Following' : 'Follow'),
          ),
        ],
      ),
    )`),
  [['Initial state', [['text', 'Followers: 120'], ['text', 'Follow']]], ['Follow increments', [['tap', 'Follow'], ['text', 'Followers: 121'], ['text', 'Following']]], ['Unfollow reverts', [['tap', 'Follow'], ['tap', 'Following'], ['text', 'Followers: 120']]]],
  ['Keep two pieces of state (a bool and an int) and update both inside one setState call.']);
const boundedCounter = ui('ct2', 'Bounded counter', "Counter starting at 0 ('Count: N') with IconButtons tooltipped 'Increase' and 'Decrease'. Clamp to 0–10: disable Decrease at 0 and Increase at 10 (onPressed: null). Show 'Limit reached' at 10 and a TextButton 'Reset'.",
  stateful('BoundedCounter', '  int count = 0;\n  final int max = 10;', `Column(
      children: [
        Text('Count: $count'),
        if (count == max) const Text('Limit reached'),
        Row(
          children: [
            IconButton(icon: const Icon(Icons.remove), tooltip: 'Decrease', onPressed: count > 0 ? () => setState(() => count--) : null),
            IconButton(icon: const Icon(Icons.add), tooltip: 'Increase', onPressed: count < max ? () => setState(() => count++) : null),
          ],
        ),
        TextButton(onPressed: () => setState(() => count = 0), child: const Text('Reset')),
      ],
    )`),
  [['Decrease disabled at 0', [['text', 'Count: 0'], ['prop', 'IconButton', 'onPressed', 'null']]], ['Increments', [['tap', 'Increase'], ['tap', 'Increase'], ['tap', 'Increase'], ['text', 'Count: 3']]], ['Limit at 10', [...Array(10).fill(['tap', 'Increase']) as Step[], ['text', 'Count: 10'], ['text', 'Limit reached']]], ['Reset', [['tap', 'Increase'], ['tap', 'Reset'], ['text', 'Count: 0'], ['notext', 'Limit']]]],
  ['A conditional callback — condition ? () => ... : null — disables a button declaratively.']);
const settingsScreen = ui('st2', 'Interactive settings', "A SwitchListTile 'Notifications' (default on) with Text 'Notifications on/off'; a Slider for font size 10–30 (default 14) with Text 'Font: N' (rounded); a DropdownButton<String> with 'Light' and 'Dark' and Text 'Theme: X'.",
  stateful('SettingsPanel', "  bool notifications = true;\n  double fontSize = 14;\n  String theme = 'Light';", `Column(
      children: [
        SwitchListTile(title: const Text('Notifications'), value: notifications, onChanged: (v) => setState(() => notifications = v)),
        Text(notifications ? 'Notifications on' : 'Notifications off'),
        Slider(value: fontSize, min: 10, max: 30, divisions: 20, onChanged: (v) => setState(() => fontSize = v)),
        Text('Font: \${fontSize.round()}'),
        DropdownButton<String>(
          value: theme,
          items: const [
            DropdownMenuItem(value: 'Light', child: Text('Light')),
            DropdownMenuItem(value: 'Dark', child: Text('Dark')),
          ],
          onChanged: (v) => setState(() => theme = v ?? 'Light'),
        ),
        Text('Theme: $theme'),
      ],
    )`),
  [['Defaults', [['text', 'Notifications on'], ['text', 'Font: 14'], ['text', 'Theme: Light']]], ['Switch toggles', [['toggle', 0], ['text', 'Notifications off']]], ['Slider updates', [['slider', 0, 20], ['text', 'Font: 20']]], ['Dropdown selects', [['select', 0, 'Dark'], ['text', 'Theme: Dark']]]],
  ['Every selection control is controlled: store the new value from onChanged in state.']);
const calcLogic = logic('calc1', 'Calculator engine', 'calculate', 'double? calculate(double a, String op, double b)', "Return a op b for '+', '-', '*', '/'. Return null for division by zero or an unknown operator.",
  'double? calculate(double a, String op, double b) {\n  // TODO\n  return null;\n}\n',
  "double? calculate(double a, String op, double b) {\n  switch (op) {\n    case '+':\n      return a + b;\n    case '-':\n      return a - b;\n    case '*':\n      return a * b;\n    case '/':\n      return b == 0 ? null : a / b;\n  }\n  return null;\n}\n",
  [["calculate(2, '+', 3)", '5.0'], ["calculate(7, '/', 2)", '3.5'], ["calculate(4, '*', 2.5)", '10.0'], ["calculate(1, '/', 0)", 'null'], ["calculate(2, '^', 3)", 'null']], ['Return early for the error cases; a nullable return type models "no result".']);
const calcUi = ui('calc2', 'Calculator screen', "Two TextFields (first and second number) and four TextButtons labelled '+', '-', '*', '/'. Show 'Result: R' (e.g. 'Result: 5.0'), 'Cannot divide by zero', or 'Invalid input' when either field is not a number.",
  stateful('Calculator', `  final a = TextEditingController();
  final b = TextEditingController();
  String result = '';

  void compute(String op) {
    final x = double.tryParse(a.text);
    final y = double.tryParse(b.text);
    if (x == null || y == null) {
      setState(() => result = 'Invalid input');
      return;
    }
    if (op == '/' && y == 0) {
      setState(() => result = 'Cannot divide by zero');
      return;
    }
    final r = switch (op) { '+' => x + y, '-' => x - y, '*' => x * y, _ => x / y };
    setState(() => result = 'Result: $r');
  }`, `Column(
      children: [
        TextField(controller: a, decoration: const InputDecoration(labelText: 'First number')),
        TextField(controller: b, decoration: const InputDecoration(labelText: 'Second number')),
        Row(children: [for (final op in ['+', '-', '*', '/']) TextButton(onPressed: () => compute(op), child: Text(op))]),
        Text(result),
      ],
    )`),
  [['Addition', [['enter', 0, '2'], ['enter', 1, '3'], ['tap', '+'], ['text', 'Result: 5.0']]], ['Division', [['enter', 0, '7'], ['enter', 1, '2'], ['tap', '/'], ['text', 'Result: 3.5']]], ['Divide by zero', [['enter', 0, '1'], ['enter', 1, '0'], ['tap', '/'], ['text', 'Cannot divide by zero']]], ['Invalid input', [['enter', 0, 'x'], ['enter', 1, '2'], ['tap', '+'], ['text', 'Invalid input']]]],
  ['double.tryParse returns null for invalid text — validate before computing.']);
const QUIZ_BASE = "class Question {\n  final String text;\n  final List<String> options;\n  final int answer;\n  const Question(this.text, this.options, this.answer);\n}\n\nfinal sample = [\n  const Question('2 + 2?', ['3', '4'], 1),\n  const Question('Dart is…', ['typed', 'untyped'], 0),\n];\n\n";
const quizLogic = logic('quiz1', 'Quiz engine', 'Quiz', 'class Quiz { Quiz(List<Question>); bool answer(int); int score; bool get isFinished; }', 'Implement Quiz: answer(choice) returns whether the choice is correct, increments score when correct, advances to the next question, and returns false once finished.',
  QUIZ_BASE + 'class Quiz {\n  // TODO: questions, index, score, isFinished, answer()\n}\n',
  QUIZ_BASE + 'class Quiz {\n  final List<Question> questions;\n  int index = 0;\n  int score = 0;\n  Quiz(this.questions);\n  bool get isFinished => index >= questions.length;\n  Question get current => questions[index];\n  bool answer(int choice) {\n    if (isFinished) return false;\n    final ok = choice == current.answer;\n    if (ok) score++;\n    index++;\n    return ok;\n  }\n}\n',
  [['Quiz(sample).answer(1)', 'true'], ['(Quiz(sample)..answer(1)).score', '1'], ['(Quiz(sample)..answer(0)).score', '0'], ['(Quiz(sample)..answer(1)..answer(0)).isFinished', 'true'], ['(Quiz(sample)..answer(1)..answer(0)).answer(0)', 'false']], ['Keep index and score as state; a getter computes isFinished.']);
const quizUi = ui('quiz2', 'Quiz app', "Three questions shown one at a time as 'Question N/3' plus the question text and one ElevatedButton per option. After the last answer show 'Score: S/3' and a 'Restart' button. Q1 'Which widget can hold mutable State?' (StatelessWidget, StatefulWidget ✓), Q2 'Which call triggers a rebuild?' (setState ✓, print), Q3 'Which keyword declares a compile-time constant?' (const ✓, var).",
  stateful('QuizApp', `  final questions = ['Which widget can hold mutable State?', 'Which call triggers a rebuild?', 'Which keyword declares a compile-time constant?'];
  final options = [['StatelessWidget', 'StatefulWidget'], ['setState', 'print'], ['const', 'var']];
  final answers = [1, 0, 0];
  int index = 0;
  int score = 0;`, `index >= questions.length
        ? Column(children: [
            Text('Score: $score/\${questions.length}'),
            ElevatedButton(onPressed: () => setState(() { index = 0; score = 0; }), child: const Text('Restart')),
          ])
        : Column(children: [
            Text('Question \${index + 1}/\${questions.length}'),
            Text(questions[index]),
            for (var i = 0; i < options[index].length; i++)
              ElevatedButton(
                onPressed: () => setState(() {
                  if (i == answers[index]) score++;
                  index++;
                }),
                child: Text(options[index][i]),
              ),
          ])`),
  [['Starts at question 1', [['text', 'Question 1/3'], ['text', 'Which widget can hold mutable State?']]], ['Perfect score', [['tap', 'StatefulWidget'], ['tap', 'setState'], ['tap', 'const'], ['text', 'Score: 3/3']]], ['Zero score', [['tap', 'StatelessWidget'], ['tap', 'print'], ['tap', 'var'], ['text', 'Score: 0/3']]], ['Restart', [['tap', 'StatefulWidget'], ['tap', 'print'], ['tap', 'const'], ['text', 'Score: 2/3'], ['tap', 'Restart'], ['text', 'Question 1/3']]]],
  ['A ternary on index >= length chooses between the question view and the results view.']);

// ---------------- Intermediate ----------------
const todoUi = ui('todo2', 'Task list with completion', "TextField + 'Add' button adding trimmed, non-empty tasks. Each task is a CheckboxListTile. Show 'Done: D/T'.",
  stateful('TodoList', `  final controller = TextEditingController();
  final titles = <String>[];
  final done = <bool>[];

  void add() {
    final t = controller.text.trim();
    if (t.isEmpty) return;
    setState(() {
      titles.add(t);
      done.add(false);
      controller.clear();
    });
  }`, `Column(
      children: [
        TextField(controller: controller),
        ElevatedButton(onPressed: add, child: const Text('Add')),
        Text('Done: \${done.where((d) => d).length}/\${titles.length}'),
        for (var i = 0; i < titles.length; i++)
          CheckboxListTile(title: Text(titles[i]), value: done[i], onChanged: (v) => setState(() => done[i] = v ?? false)),
      ],
    )`),
  [['Adds tasks', [['enter', 0, 'Plan'], ['tap', 'Add'], ['enter', 0, 'Build'], ['tap', 'Add'], ['text', 'Done: 0/2'], ['has', 'CheckboxListTile', 2]]], ['Toggles completion', [['enter', 0, 'Plan'], ['tap', 'Add'], ['enter', 0, 'Build'], ['tap', 'Add'], ['toggle', 0], ['text', 'Done: 1/2']]], ['Ignores blank input', [['enter', 0, '   '], ['tap', 'Add'], ['text', 'Done: 0/0']]]],
  ['Parallel lists (titles/done) work; a Task class with copyWith is the next refinement.']);
const CATALOG = "class Product {\n  final String name;\n  final double price;\n  const Product(this.name, this.price);\n}\n\nfinal catalog = [Product('Desk Lamp', 25), Product('Lamp Shade', 12.5), Product('Chair', 80), Product('Desk', 150)];\n\n";
const catalogLogic = logic('cat1', 'Catalog search', 'search', 'List<String> search(List<Product> items, String query, {double? maxPrice})', 'Return the names of products whose name contains query (case-insensitive, trimmed) and whose price ≤ maxPrice when given, sorted alphabetically.',
  CATALOG + 'List<String> search(List<Product> items, String query, {double? maxPrice}) {\n  // TODO\n  return [];\n}\n',
  CATALOG + 'List<String> search(List<Product> items, String query, {double? maxPrice}) {\n  final q = query.trim().toLowerCase();\n  final result = items\n      .where((p) => p.name.toLowerCase().contains(q) && (maxPrice == null || p.price <= maxPrice))\n      .map((p) => p.name)\n      .toList();\n  result.sort();\n  return result;\n}\n',
  [["search(catalog, 'lamp')", '[Desk Lamp, Lamp Shade]'], ["search(catalog, 'DESK')", '[Desk, Desk Lamp]'], ["search(catalog, 'lamp', maxPrice: 20)", '[Lamp Shade]'], ["search(catalog, '')", '[Chair, Desk, Desk Lamp, Lamp Shade]'], ["search(catalog, 'sofa')", '[]']], ['Combine both predicates in one where(); sort a materialised list.']);
const catalogUi = ui('cat2', 'Searchable catalog screen', "A TextField (label 'Search') filters the products ['Desk Lamp', 'Office Chair', 'Standing Desk', 'Monitor'] case-insensitively. Show 'N results', one ListTile per match, and 'No products found' when nothing matches.",
  appWrap('const Scaffold(body: Catalog())', `
const products = ['Desk Lamp', 'Office Chair', 'Standing Desk', 'Monitor'];

class Catalog extends StatefulWidget {
  const Catalog({super.key});

  @override
  State<Catalog> createState() => _CatalogState();
}

class _CatalogState extends State<Catalog> {
  String query = '';

  @override
  Widget build(BuildContext context) {
    final visible = products.where((p) => p.toLowerCase().contains(query.toLowerCase())).toList();
    return Column(
      children: [
        TextField(decoration: const InputDecoration(labelText: 'Search'), onChanged: (v) => setState(() => query = v)),
        Text('\${visible.length} results'),
        if (visible.isEmpty) const Text('No products found'),
        ...visible.map((p) => ListTile(title: Text(p))),
      ],
    );
  }
}
`),
  [['Shows everything', [['text', '4 results'], ['has', 'ListTile', 4]]], ['Filters', [['enter', 0, 'desk'], ['text', '2 results'], ['has', 'ListTile', 2]]], ['Empty state', [['enter', 0, 'zzz'], ['text', '0 results'], ['text', 'No products found']]]],
  ['Derive the visible list inside build() from the source list and the query.']);
const recordUi = ui('rec2', 'Validated record manager', "A Form with a GlobalKey<FormState> and two TextFormFields (name, age) using controllers. Name required ('Name is required'); age must be an int 0–130 ('Enter a valid age'). 'Save' validates, then adds 'NAME (AGE)' as a ListTile and clears the fields. Show 'Records: N'.",
  stateful('RecordManager', `  final formKey = GlobalKey<FormState>();
  final name = TextEditingController();
  final age = TextEditingController();
  final records = <String>[];

  void save() {
    if (!formKey.currentState!.validate()) return;
    setState(() {
      records.add('\${name.text.trim()} (\${age.text.trim()})');
      name.clear();
      age.clear();
    });
  }`, `Form(
      key: formKey,
      child: Column(
        children: [
          TextFormField(controller: name, decoration: const InputDecoration(labelText: 'Name'), validator: (v) => (v == null || v.trim().isEmpty) ? 'Name is required' : null),
          TextFormField(
            controller: age,
            decoration: const InputDecoration(labelText: 'Age'),
            validator: (v) {
              final n = int.tryParse((v ?? '').trim());
              if (n == null || n < 0 || n > 130) return 'Enter a valid age';
              return null;
            },
          ),
          ElevatedButton(onPressed: save, child: const Text('Save')),
          Text('Records: \${records.length}'),
          for (final r in records) ListTile(title: Text(r)),
        ],
      ),
    )`),
  [['Saves a valid record', [['enter', 0, 'Ada'], ['enter', 1, '36'], ['tap', 'Save'], ['text', 'Records: 1'], ['within', 'ListTile', 'Ada (36)']]], ['Rejects missing name', [['enter', 0, ''], ['enter', 1, '36'], ['tap', 'Save'], ['text', 'Records: 0']]], ['Rejects invalid age', [['enter', 0, 'Bo'], ['enter', 1, 'abc'], ['tap', 'Save'], ['text', 'Records: 0'], ['enter', 1, '200'], ['tap', 'Save'], ['text', 'Records: 0']]]],
  ['validate() runs every field validator; only mutate state when it returns true.']);
const notesUi = ui('notes2', 'Multi-screen notes', "Home (AppBar 'Notes') lists notes ['Groceries', 'Ideas'] as ListTiles and shows 'Notes: N'. Tapping a note pushes a detail screen with 'Note: TITLE' and a 'Back' button. A 'New note' button pushes an editor with a TextField and 'Save': blank titles show 'Title required'; valid titles are added via a callback and the editor pops.",
  appWrap('const NotesHome()', `
class NotesHome extends StatefulWidget {
  const NotesHome({super.key});

  @override
  State<NotesHome> createState() => _NotesHomeState();
}

class _NotesHomeState extends State<NotesHome> {
  final notes = <String>['Groceries', 'Ideas'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notes')),
      body: Column(
        children: [
          Text('Notes: \${notes.length}'),
          for (final n in notes)
            ListTile(title: Text(n), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => NoteDetail(title: n)))),
          ElevatedButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => NoteEditor(onSave: (t) => setState(() => notes.add(t))))),
            child: const Text('New note'),
          ),
        ],
      ),
    );
  }
}

class NoteDetail extends StatelessWidget {
  final String title;
  const NoteDetail({super.key, required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Column(children: [
        Text('Note: $title'),
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Back')),
      ]),
    );
  }
}

class NoteEditor extends StatefulWidget {
  final void Function(String) onSave;
  const NoteEditor({super.key, required this.onSave});

  @override
  State<NoteEditor> createState() => _NoteEditorState();
}

class _NoteEditorState extends State<NoteEditor> {
  final controller = TextEditingController();
  String error = '';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New note')),
      body: Column(children: [
        TextField(controller: controller),
        Text(error),
        ElevatedButton(
          onPressed: () {
            final t = controller.text.trim();
            if (t.isEmpty) {
              setState(() => error = 'Title required');
              return;
            }
            widget.onSave(t);
            Navigator.pop(context);
          },
          child: const Text('Save'),
        ),
      ]),
    );
  }
}
`),
  [['Opens a note', [['tap', 'Ideas'], ['text', 'Note: Ideas']]], ['Back returns home', [['tap', 'Ideas'], ['tap', 'Back'], ['text', 'Notes: 2']]], ['Creates a note', [['tap', 'New note'], ['enter', 0, 'Travel'], ['tap', 'Save'], ['text', 'Notes: 3'], ['within', 'ListTile', 'Travel']]], ['Validates the editor', [['tap', 'New note'], ['tap', 'Save'], ['text', 'Title required']]]],
  ['Pass an onSave callback into the editor; the home State stays mounted underneath the pushed route.']);
const apiLogic = logic('api1', 'Response handling', 'describeResponse', 'String describeResponse(int status, String body)', "Return 'error STATUS' for non-2xx, 'bad data' for invalid JSON or a non-list body, 'empty' for [], otherwise 'users: A, B' from each object's 'name'.",
  "import 'dart:convert';\n\nString describeResponse(int status, String body) {\n  // TODO\n  return '';\n}\n",
  "import 'dart:convert';\n\nString describeResponse(int status, String body) {\n  if (status < 200 || status >= 300) return 'error $status';\n  try {\n    final data = jsonDecode(body);\n    if (data is! List) return 'bad data';\n    if (data.isEmpty) return 'empty';\n    return 'users: ${data.map((u) => u['name']).join(', ')}';\n  } on FormatException {\n    return 'bad data';\n  }\n}\n",
  [[`describeResponse(200, '[{"name": "Ada"}, {"name": "Linus"}]')`, 'users: Ada, Linus'], ["describeResponse(200, '[]')", 'empty'], ["describeResponse(500, 'oops')", 'error 500'], ["describeResponse(200, 'not json')", 'bad data'], [`describeResponse(200, '{"a": 1}')`, 'bad data']], ['Check the status code before decoding; catch FormatException for malformed JSON.']);
const API_BASE = `${M}import 'dart:convert';

// Local fixture + fake API (provided). The first call fails to simulate a flaky network.
const okFixture = '[{"name": "Ada"}, {"name": "Grace"}]';

class FakeApi {
  int calls = 0;
  bool failNext;
  FakeApi({this.failNext = false});

  Future<List<String>> fetchUsers() async {
    calls++;
    await Future.delayed(const Duration(milliseconds: 300));
    if (failNext) {
      failNext = false;
      throw Exception('server unavailable');
    }
    final data = jsonDecode(okFixture) as List;
    return data.map((u) => u['name'] as String).toList();
  }
}

void main() {
  runApp(const MaterialApp(home: Scaffold(body: UsersScreen())));
}
`;
const apiUi = ui('api2', 'API screen with loading, error and retry', "Using the provided FakeApi(failNext: true): show 'Tap Load to fetch users' initially and a 'Load' button. On error show 'Error: <message>' and a 'Retry' button; on success show 'N users' and one ListTile per user ('No users' if empty). Check mounted after await.",
  API_BASE + `
class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  final api = FakeApi(failNext: true);
  String status = 'idle';
  List<String> users = [];
  String error = '';

  Future<void> load() async {
    setState(() => status = 'loading');
    try {
      final result = await api.fetchUsers();
      if (!mounted) return;
      setState(() {
        users = result;
        status = 'done';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = '$e';
        status = 'error';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (status == 'idle') {
      body = const Text('Tap Load to fetch users');
    } else if (status == 'loading') {
      body = const CircularProgressIndicator();
    } else if (status == 'error') {
      body = Column(children: [Text('Error: $error'), ElevatedButton(onPressed: load, child: const Text('Retry'))]);
    } else if (users.isEmpty) {
      body = const Text('No users');
    } else {
      body = Column(children: [Text('\${users.length} users'), ...users.map((u) => ListTile(title: Text(u)))]);
    }
    return Column(children: [ElevatedButton(onPressed: load, child: const Text('Load')), body]);
  }
}
`,
  [['Idle state', [['text', 'Tap Load to fetch users']]], ['Error state', [['tap', 'Load'], ['text', 'server unavailable'], ['text', 'Retry']]], ['Retry recovers', [['tap', 'Load'], ['tap', 'Retry'], ['text', '2 users'], ['within', 'ListTile', 'Grace']]]],
  ['Wrap the await in try/catch and keep one status variable for idle/loading/error/done.'],
  API_BASE + "\nclass UsersScreen extends StatelessWidget {\n  const UsersScreen({super.key});\n\n  @override\n  Widget build(BuildContext context) {\n    // TODO: make this stateful and implement load/error/retry\n    return const Text('TODO');\n  }\n}\n");

// ---------------- Advanced ----------------
const EXP_BASE = "class Expense {\n  final String category;\n  final double amount;\n  const Expense(this.category, this.amount);\n}\n\nabstract class ExpenseRepository {\n  void add(Expense e);\n  List<Expense> all();\n}\n\n";
const EXP_SOLUTION = EXP_BASE + "class InMemoryExpenseRepository implements ExpenseRepository {\n  final List<Expense> _items = [];\n  @override\n  void add(Expense e) => _items.add(e);\n  @override\n  List<Expense> all() => List.unmodifiable(_items);\n}\n\nclass ExpenseService {\n  final ExpenseRepository repo;\n  ExpenseService(this.repo);\n\n  bool addExpense(String category, double amount) {\n    if (amount <= 0 || category.trim().isEmpty) return false;\n    repo.add(Expense(category.trim(), amount));\n    return true;\n  }\n\n  double total() => repo.all().fold(0.0, (s, e) => s + e.amount);\n\n  Map<String, double> byCategory() {\n    final out = <String, double>{};\n    for (final e in repo.all()) {\n      out[e.category] = (out[e.category] ?? 0) + e.amount;\n    }\n    return out;\n  }\n}\n";
const EXP_HELPER = "\n// Used by the tests — keep this helper.\nExpenseService demo() {\n  final s = ExpenseService(InMemoryExpenseRepository());\n  s.addExpense('Food', 12.5);\n  s.addExpense('Travel', 30);\n  s.addExpense('Food', 7.5);\n  s.addExpense('Food', -3);\n  return s;\n}\n";
const expenseLogic = logic('exp1', 'Expense repository & service', 'ExpenseService', 'class InMemoryExpenseRepository implements ExpenseRepository; class ExpenseService(ExpenseRepository repo)', 'Implement InMemoryExpenseRepository and ExpenseService with addExpense (rejects amount ≤ 0 or blank category), total() and byCategory().',
  EXP_BASE + '// TODO: InMemoryExpenseRepository and ExpenseService\n' + EXP_HELPER, EXP_SOLUTION + EXP_HELPER,
  [['demo().total()', '50.0'], ['demo().byCategory()', '{Food: 20.0, Travel: 30.0}'], ["ExpenseService(InMemoryExpenseRepository()).addExpense('Food', 0)", 'false'], ['InMemoryExpenseRepository() is ExpenseRepository', 'true']], ['The service depends on the abstract ExpenseRepository; the in-memory class is just one implementation.']);
const expenseUi = ui('exp2', 'Expense tracker screen', "Using your ExpenseService: a TextField for the amount and ElevatedButtons 'Food' and 'Travel' that add an expense in that category. Invalid amounts show 'Enter a valid amount'. Show 'Total: X.XX' and one 'Category: X.XX' line per category.",
  M + EXP_SOLUTION + `
void main() {
  runApp(const MaterialApp(home: Scaffold(body: ExpenseScreen())));
}

class ExpenseScreen extends StatefulWidget {
  const ExpenseScreen({super.key});

  @override
  State<ExpenseScreen> createState() => _ExpenseScreenState();
}

class _ExpenseScreenState extends State<ExpenseScreen> {
  final controller = TextEditingController();
  final service = ExpenseService(InMemoryExpenseRepository());
  String error = '';

  void add(String category) {
    final amount = double.tryParse(controller.text);
    if (amount == null || !service.addExpense(category, amount)) {
      setState(() => error = 'Enter a valid amount');
      return;
    }
    setState(() {
      error = '';
      controller.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        TextField(controller: controller, decoration: const InputDecoration(labelText: 'Amount')),
        Row(children: [
          ElevatedButton(onPressed: () => add('Food'), child: const Text('Food')),
          ElevatedButton(onPressed: () => add('Travel'), child: const Text('Travel')),
        ]),
        if (error.isNotEmpty) Text(error),
        Text('Total: \${service.total().toStringAsFixed(2)}'),
        for (final e in service.byCategory().entries) Text('\${e.key}: \${e.value.toStringAsFixed(2)}'),
      ],
    );
  }
}
`,
  [['Adds and totals', [['enter', 0, '12.5'], ['tap', 'Food'], ['enter', 0, '30'], ['tap', 'Travel'], ['text', 'Total: 42.50'], ['text', 'Food: 12.50'], ['text', 'Travel: 30.00']]], ['Rejects invalid amounts', [['enter', 0, 'abc'], ['tap', 'Food'], ['text', 'Enter a valid amount'], ['text', 'Total: 0.00']]], ['Rejects negative amounts', [['enter', 0, '-5'], ['tap', 'Travel'], ['text', 'Enter a valid amount']]]],
  ['Reuse the service from milestone 1 — the widget should not contain business rules.'],
  M + EXP_SOLUTION + "\nvoid main() {\n  runApp(const MaterialApp(home: Scaffold(body: Text('TODO: ExpenseScreen'))));\n}\n");
const inventoryLogic = logic('inv2', 'Offline-first inventory', 'Inventory', 'class Inventory { bool adjust(String sku, int delta); int stockOf(String sku); int get pendingCount; int sync(bool online); }', 'Apply stock changes locally first (never below zero — return false), queue each successful change for sync, and sync(online) clears the queue returning how many were sent (0 when offline).',
  'class Inventory {\n  // TODO\n}\n',
  "class Inventory {\n  final Map<String, int> _stock = {};\n  final List<String> _pending = [];\n\n  int stockOf(String sku) => _stock[sku] ?? 0;\n  int get pendingCount => _pending.length;\n\n  bool adjust(String sku, int delta) {\n    final next = stockOf(sku) + delta;\n    if (next < 0) return false;\n    _stock[sku] = next;\n    _pending.add('$sku:$delta');\n    return true;\n  }\n\n  int sync(bool online) {\n    if (!online) return 0;\n    final n = _pending.length;\n    _pending.clear();\n    return n;\n  }\n}\n",
  [["(Inventory()..adjust('A', 5)).stockOf('A')", '5'], ["(Inventory()..adjust('A', 5)..adjust('A', -9)).stockOf('A')", '5'], ["(Inventory()..adjust('A', 2)..adjust('B', 1)).pendingCount", '2'], ["(Inventory()..adjust('A', 2)).sync(false)", '0'], ["(Inventory()..adjust('A', 2)..adjust('A', 1)).sync(true)", '2'], ["(Inventory()..adjust('A', 2)..sync(true)).pendingCount", '0']], ['The local map is the source of truth; the pending list is the sync queue.']);
const AUTH = "class AuthService {\n  final Map<String, String> _users = {'ada@x.io': 'secret12'};\n  int _failures = 0;\n  String? currentUser;\n\n  String login(String email, String password) {\n    if (_failures >= 3) return 'locked';\n    final key = email.trim().toLowerCase();\n    if (_users[key] == password) {\n      _failures = 0;\n      currentUser = key;\n      return 'ok';\n    }\n    _failures++;\n    return _failures >= 3 ? 'locked' : 'invalid credentials';\n  }\n\n  void logout() => currentUser = null;\n}\n";
const authLogic = logic('auth1', 'Authentication service', 'AuthService', "class AuthService { String login(String email, String password); void logout(); String? currentUser; }", "Users: {'ada@x.io': 'secret12'}. login returns 'ok' (sets currentUser to the normalised email), 'invalid credentials', or 'locked' on and after the 3rd consecutive failure. logout clears currentUser.",
  'class AuthService {\n  // TODO\n}\n', AUTH,
  [["AuthService().login('ada@x.io', 'secret12')", 'ok'], ["AuthService().login('ada@x.io', 'nope')", 'invalid credentials'], ["(AuthService()..login('ada@x.io', 'a')..login('ada@x.io', 'b')).login('ada@x.io', 'c')", 'locked'], ["(AuthService()..login('a', 'a')..login('a', 'a')..login('a', 'a')).login('ada@x.io', 'secret12')", 'locked'], ["(AuthService()..login(' ADA@x.io ', 'secret12')).currentUser", 'ada@x.io'], ["(AuthService()..login('ada@x.io', 'secret12')..logout()).currentUser", 'null']], ['Normalise the email once; count consecutive failures and reset on success.']);
const authUi = ui('auth2', 'Login flow simulation', "Using AuthService: email and password TextFields and an ElevatedButton 'Login'. Wrong credentials show 'Invalid email or password'; locked shows 'Account locked'. Success pushes a home screen with AppBar 'Welcome, EMAIL' and a 'Logout' button that logs out and returns to the login screen.",
  M + AUTH + `
void main() {
  runApp(const MaterialApp(home: LoginPage()));
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final auth = AuthService();
  final email = TextEditingController();
  final password = TextEditingController();
  String message = '';

  void login() {
    final r = auth.login(email.text, password.text);
    if (r == 'ok') {
      setState(() => message = '');
      Navigator.push(context, MaterialPageRoute(builder: (_) => HomePage(email: auth.currentUser!, onLogout: () {
        auth.logout();
        Navigator.pop(context);
      })));
    } else {
      setState(() => message = r == 'locked' ? 'Account locked' : 'Invalid email or password');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(children: [
        TextField(controller: email, decoration: const InputDecoration(labelText: 'Email')),
        TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
        ElevatedButton(onPressed: login, child: const Text('Login')),
        Text(message),
      ]),
    );
  }
}

class HomePage extends StatelessWidget {
  final String email;
  final VoidCallback onLogout;
  const HomePage({super.key, required this.email, required this.onLogout});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Welcome, $email')),
      body: TextButton(onPressed: onLogout, child: const Text('Logout')),
    );
  }
}
`,
  [['Rejects wrong password', [['enter', 0, 'ada@x.io'], ['enter', 1, 'x'], ['tap', 'Login'], ['text', 'Invalid email or password']]], ['Logs in', [['enter', 0, 'ada@x.io'], ['enter', 1, 'secret12'], ['tap', 'Login'], ['within', 'AppBar', 'Welcome, ada@x.io']]], ['Logs out', [['enter', 0, 'ada@x.io'], ['enter', 1, 'secret12'], ['tap', 'Login'], ['tap', 'Logout'], ['notext', 'Welcome'], ['text', 'Login']]], ['Locks after 3 failures', [['enter', 0, 'ada@x.io'], ['enter', 1, 'x'], ['tap', 'Login'], ['tap', 'Login'], ['tap', 'Login'], ['text', 'Account locked']]]],
  ['Keep auth decisions in AuthService; the widget only maps results to messages and navigation.'],
  M + AUTH + "\nvoid main() {\n  runApp(const MaterialApp(home: Scaffold(body: Text('TODO: LoginPage'))));\n}\n");
const DASH_BASE = "class Order {\n  final String customer;\n  final double amount;\n  const Order(this.customer, this.amount);\n}\n\n";
const DASH_MODEL = "class DashboardModel extends ChangeNotifier {\n  final List<Order> _orders = [];\n\n  void addOrder(Order o) {\n    if (o.amount <= 0) return;\n    _orders.add(o);\n    notifyListeners();\n  }\n\n  int get count => _orders.length;\n  double get revenue => _orders.fold(0.0, (s, o) => s + o.amount);\n  double get average => count == 0 ? 0.0 : revenue / count;\n\n  String get topCustomer {\n    if (_orders.isEmpty) return 'none';\n    final totals = <String, double>{};\n    for (final o in _orders) {\n      totals[o.customer] = (totals[o.customer] ?? 0) + o.amount;\n    }\n    var best = totals.keys.first;\n    for (final k in totals.keys) {\n      if (totals[k]! > totals[best]!) best = k;\n    }\n    return best;\n  }\n}\n";
const DASH_HELPERS = "\n// Used by the tests — keep these helpers.\nDashboardModel sample() => DashboardModel()\n  ..addOrder(Order('Ana', 30))\n  ..addOrder(Order('Bo', 50))\n  ..addOrder(Order('Ana', 40))\n  ..addOrder(Order('Cy', -5));\n\nint notifications() {\n  var n = 0;\n  final m = DashboardModel();\n  m.addListener(() => n++);\n  m.addOrder(Order('A', 1));\n  m.addOrder(Order('B', 0));\n  return n;\n}\n";
const dashLogic = logic('dash1', 'Dashboard state model', 'DashboardModel', 'class DashboardModel extends ChangeNotifier', 'Implement addOrder (ignores amounts ≤ 0, notifies listeners on change), count, revenue, average (0.0 when empty) and topCustomer (highest total, "none" when empty).',
  DASH_BASE + 'class DashboardModel extends ChangeNotifier {\n  // TODO: addOrder, count, revenue, average, topCustomer\n}\n' + DASH_HELPERS, DASH_BASE + DASH_MODEL + DASH_HELPERS,
  [['sample().count', '3'], ['sample().revenue', '120.0'], ['sample().average', '40.0'], ['sample().topCustomer', 'Ana'], ['DashboardModel().topCustomer', 'none'], ['notifications()', '1']], ['Derived values (revenue, average) should be getters, not stored fields.']);
const testKit = (_store: string) => `
int _checks = 0;
void expectEq(Object? actual, Object? expected) {
  _checks++;
  if (actual != expected) throw StateError('Expected $expected but got $actual');
}
`;
const graderHelpers = (store: string, mutants: string) => `
// ---- Used by the grader — keep everything below. ----
${mutants}
String runChecks() {
  _checks = 0;
  try {
    runTests(() => ${store}());
  } catch (e) {
    return 'failed: $e';
  }
  return _checks >= 4 ? 'ok' : 'too few checks ($_checks)';
}

bool catches(${store} Function() make) {
  try {
    runTests(make);
  } catch (e) {
    return true;
  }
  return false;
}
`;
const DASH_MUTANTS = "class BuggyDashboard extends DashboardModel {\n  @override\n  void addOrder(Order o) {\n    _orders.add(o); // bug: accepts non-positive amounts\n    notifyListeners();\n  }\n}\n\nclass BuggyAverage extends DashboardModel {\n  @override\n  double get average => revenue; // bug: forgets to divide\n}\n";
const dashTests = logic('dash2', 'Write the dashboard tests', 'runTests', 'void runTests(DashboardModel Function() make)', 'Write at least 4 expectEq checks against a fresh model from make(). Your tests must pass on the real DashboardModel AND fail on both seeded bugs (BuggyDashboard accepts negative orders; BuggyAverage miscomputes the average).',
  DASH_BASE + DASH_MODEL + testKit('DashboardModel') + '\n// TODO: write your tests here.\nvoid runTests(DashboardModel Function() make) {\n}\n' + graderHelpers('DashboardModel', DASH_MUTANTS),
  DASH_BASE + DASH_MODEL + testKit('DashboardModel') + "\nvoid runTests(DashboardModel Function() make) {\n  final m = make();\n  expectEq(m.count, 0);\n  expectEq(m.topCustomer, 'none');\n  m.addOrder(const Order('Ana', 30));\n  m.addOrder(const Order('Bo', 10));\n  expectEq(m.count, 2);\n  expectEq(m.average, 20.0);\n  m.addOrder(const Order('Cy', -5));\n  expectEq(m.count, 2);\n  expectEq(m.topCustomer, 'Ana');\n}\n" + graderHelpers('DashboardModel', DASH_MUTANTS),
  [['runChecks()', 'ok'], ['catches(() => BuggyDashboard())', 'true'], ['catches(() => BuggyAverage())', 'true']], ['A good test suite fails when behaviour is wrong: check an invalid order and a computed average.']);

// ---------------- Capstone ----------------
const TASK_STORE = "class Task {\n  final String title;\n  final bool done;\n  const Task(this.title, {this.done = false});\n  Task toggled() => Task(title, done: !done);\n  Map<String, dynamic> toJson() => {'title': title, 'done': done};\n  factory Task.fromJson(Map<String, dynamic> j) => Task(j['title'] as String, done: j['done'] as bool? ?? false);\n}\n\nclass TaskStore extends ChangeNotifier {\n  final List<Task> _tasks = [];\n  List<Task> get tasks => List.unmodifiable(_tasks);\n\n  String? validate(String title) {\n    final t = title.trim();\n    if (t.isEmpty) return 'Title is required';\n    if (t.length > 40) return 'Title is too long';\n    if (_tasks.any((x) => x.title.toLowerCase() == t.toLowerCase())) return 'Duplicate task';\n    return null;\n  }\n\n  bool add(String title) {\n    if (validate(title) != null) return false;\n    _tasks.add(Task(title.trim()));\n    notifyListeners();\n    return true;\n  }\n\n  void toggle(int i) {\n    _tasks[i] = _tasks[i].toggled();\n    notifyListeners();\n  }\n\n  String save() => jsonEncode(_tasks.map((t) => t.toJson()).toList());\n\n  static TaskStore load(String raw) {\n    final store = TaskStore();\n    try {\n      final data = jsonDecode(raw) as List;\n      for (final item in data) {\n        store._tasks.add(Task.fromJson(item as Map<String, dynamic>));\n      }\n    } catch (e) {\n      // Corrupted data: start empty instead of crashing.\n    }\n    return store;\n  }\n}\n";
const capStore = logic('cap1', 'Capstone · domain, validation & persistence', 'TaskStore', 'class Task; class TaskStore extends ChangeNotifier { String? validate(String); bool add(String); void toggle(int); String save(); static TaskStore load(String raw); }',
  "Implement Task (immutable, toggled(), toJson/fromJson) and TaskStore: validate returns 'Title is required', 'Title is too long' (> 40 chars), 'Duplicate task' (case-insensitive) or null; add/toggle notify listeners; save() serialises to JSON; TaskStore.load(raw) restores and survives corrupted data by starting empty.",
  "import 'dart:convert';\n\n// TODO: class Task and class TaskStore extends ChangeNotifier\n", "import 'dart:convert';\n\n" + TASK_STORE,
  [["TaskStore().validate('   ')", 'Title is required'], ["(TaskStore()..add('Plan')).validate('plan')", 'Duplicate task'], ["(TaskStore()..add('Plan')..add('')).tasks.length", '1'], ["(TaskStore()..add('A')).save()", '[{"title":"A","done":false}]'], ["TaskStore.load((TaskStore()..add('A')..add('B')..toggle(1)).save()).tasks.last.done", 'true'], ["TaskStore.load('not json').tasks.length", '0']], ['Persistence is a round trip: save() → String → load(). Test it with corrupted input too.']);
const CAP_MUTANTS = "class NoValidationStore extends TaskStore {\n  @override\n  String? validate(String title) => null; // bug: accepts anything\n}\n\nclass LossyStore extends TaskStore {\n  @override\n  String save() => '[]'; // bug: loses data\n}\n";
const capTests = logic('cap2', 'Capstone · automated tests', 'runTests', 'void runTests(TaskStore Function() make)', 'Write ≥ 4 checks that pass on the real TaskStore and fail on both seeded bugs: NoValidationStore (accepts blank titles) and LossyStore (save() loses data). Cover validation and the save/load round trip.',
  "import 'dart:convert';\n\n" + TASK_STORE + testKit('TaskStore') + '\n// TODO: write your tests here.\nvoid runTests(TaskStore Function() make) {\n}\n' + graderHelpers('TaskStore', CAP_MUTANTS),
  "import 'dart:convert';\n\n" + TASK_STORE + testKit('TaskStore') + "\nvoid runTests(TaskStore Function() make) {\n  final s = make();\n  expectEq(s.add('Write tests'), true);\n  expectEq(s.add('   '), false);\n  expectEq(s.add('write TESTS'), false);\n  expectEq(s.tasks.length, 1);\n  s.toggle(0);\n  final restored = TaskStore.load(s.save());\n  expectEq(restored.tasks.length, 1);\n  expectEq(restored.tasks.first.done, true);\n}\n" + graderHelpers('TaskStore', CAP_MUTANTS),
  [['runChecks()', 'ok'], ['catches(() => NoValidationStore())', 'true'], ['catches(() => LossyStore())', 'true']], ['Use make() for the store under test, then TaskStore.load(s.save()) to check the round trip.']);
const CAP_PROVIDED = `${M}import 'dart:convert';

// ---- Provided infrastructure ----
class FakeStorage {
  String? data;
  String? read() => data;
  void write(String value) => data = value;
}

final storage = FakeStorage();

class TaskApi {
  int attempts = 0;
  Future<List<String>> fetchSuggestions() async {
    attempts++;
    await Future.delayed(const Duration(milliseconds: 200));
    if (attempts == 1) throw Exception('offline');
    return ['Review PR', 'Update docs'];
  }
}

// ---- Your domain layer from milestone 1 ----
${TASK_STORE}
void main() {
  runApp(const MaterialApp(home: HomePage()));
}
`;
const capUi = ui('cap3', 'Capstone · integrated task app', "Build HomePage (AppBar 'Tasks') that independently combines: STATE — one TaskStore loaded with TaskStore.load(storage.read() ?? '[]') in initState, listened to with addListener; PERSISTENCE — storage.write(store.save()) after every change; VALIDATION — TextField + 'Add' shows the validate() message as a Text; LIST — one ListTile per task with a trailing Checkbox that toggles it, plus 'D/T done' and 'No tasks yet'; NAVIGATION — on narrow screens tapping a task pushes a detail screen ('Task: TITLE', 'Back'); RESPONSIVE — at width ≥ 600 show the list and a detail pane side by side ('Select a task' until one is tapped); ERROR HANDLING — 'Load suggestions' calls TaskApi.fetchSuggestions(); on failure show 'Could not load suggestions' and 'Retry'; on success list suggestions with an IconButton tooltipped 'Add SUGGESTION'.",
  CAP_PROVIDED + `
class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  late final TaskStore store;
  final api = TaskApi();
  final controller = TextEditingController();
  String? error;
  int? selected;
  List<String> suggestions = [];
  String suggestionStatus = 'idle';

  @override
  void initState() {
    super.initState();
    store = TaskStore.load(storage.read() ?? '[]');
    store.addListener(onChange);
  }

  void onChange() {
    storage.write(store.save());
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    store.removeListener(onChange);
    controller.dispose();
    super.dispose();
  }

  void addTask() {
    final message = store.validate(controller.text);
    if (message != null) {
      setState(() => error = message);
      return;
    }
    error = null;
    store.add(controller.text);
    controller.clear();
  }

  Future<void> loadSuggestions() async {
    setState(() => suggestionStatus = 'loading');
    try {
      final items = await api.fetchSuggestions();
      if (!mounted) return;
      setState(() {
        suggestions = items;
        suggestionStatus = 'done';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => suggestionStatus = 'error');
    }
  }

  void openTask(BuildContext context, int i, bool wide) {
    if (wide) {
      setState(() => selected = i);
    } else {
      Navigator.push(context, MaterialPageRoute(builder: (_) => TaskDetail(store: store, index: i)));
    }
  }

  Widget buildList(BuildContext context, bool wide) {
    final tasks = store.tasks;
    return Column(
      children: [
        TextField(controller: controller, decoration: const InputDecoration(labelText: 'New task')),
        ElevatedButton(onPressed: addTask, child: const Text('Add')),
        if (error != null) Text(error!),
        Text('\${tasks.where((t) => t.done).length}/\${tasks.length} done'),
        if (tasks.isEmpty) const Text('No tasks yet'),
        for (var i = 0; i < tasks.length; i++)
          ListTile(
            title: Text(tasks[i].title),
            trailing: Checkbox(value: tasks[i].done, onChanged: (_) => store.toggle(i)),
            onTap: () => openTask(context, i, wide),
          ),
        const Divider(),
        if (suggestionStatus == 'idle') TextButton(onPressed: loadSuggestions, child: const Text('Load suggestions')),
        if (suggestionStatus == 'error') const Text('Could not load suggestions'),
        if (suggestionStatus == 'error') TextButton(onPressed: loadSuggestions, child: const Text('Retry')),
        for (final s in suggestions)
          ListTile(title: Text(s), trailing: IconButton(icon: const Icon(Icons.add), tooltip: 'Add $s', onPressed: () => store.add(s))),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tasks')),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 600;
          if (!wide) return buildList(context, false);
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: buildList(context, true)),
              Expanded(child: selected == null ? const Center(child: Text('Select a task')) : TaskDetail(store: store, index: selected!, embedded: true)),
            ],
          );
        },
      ),
    );
  }
}

class TaskDetail extends StatelessWidget {
  final TaskStore store;
  final int index;
  final bool embedded;
  const TaskDetail({super.key, required this.store, required this.index, this.embedded = false});

  @override
  Widget build(BuildContext context) {
    final task = store.tasks[index];
    final content = Column(children: [
      Text('Task: \${task.title}'),
      Text(task.done ? 'Status: done' : 'Status: open'),
    ]);
    if (embedded) return content;
    return Scaffold(
      appBar: AppBar(title: const Text('Details')),
      body: Column(children: [content, TextButton(onPressed: () => Navigator.pop(context), child: const Text('Back'))]),
    );
  }
}
`,
  [['Empty state & validation', [['text', 'No tasks yet'], ['tap', 'Add'], ['text', 'Title is required']]],
   ['Add, toggle & persist', [['enter', 0, 'Ship'], ['tap', 'Add'], ['within', 'ListTile', 'Ship'], ['text', '0/1 done'], ['toggle', 0], ['text', '1/1 done'], ['eval', 'storage.data', '[{"title":"Ship","done":true}]']]],
   ['Duplicate rejected', [['enter', 0, 'Ship'], ['tap', 'Add'], ['enter', 0, 'ship'], ['tap', 'Add'], ['text', 'Duplicate task'], ['has', 'ListTile', 1]]],
   ['Phone navigation', [['enter', 0, 'Ship'], ['tap', 'Add'], ['tap', 'Ship'], ['text', 'Task: Ship'], ['tap', 'Back'], ['text', '0/1 done']]],
   ['Error handling & retry', [['tap', 'Load suggestions'], ['text', 'Could not load suggestions'], ['tap', 'Retry'], ['text', 'Review PR'], ['tap', 'Add Review PR'], ['text', '0/1 done']]],
   ['Responsive two-pane (tablet width)', [['width', 800], ['text', 'Select a task'], ['enter', 0, 'Ship'], ['tap', 'Add'], ['tap', 'Ship'], ['text', 'Task: Ship'], ['text', '0/1 done']]],
   ['Phone layout has no side pane', [['notext', 'Select a task']]]],
  ['Start from the provided infrastructure. Build it in slices: list + add → toggle/persist → navigation → LayoutBuilder → suggestions with try/catch.', 'storage.write(store.save()) inside a store listener keeps persistence in one place.'],
  CAP_PROVIDED + "\nclass HomePage extends StatelessWidget {\n  const HomePage({super.key});\n\n  @override\n  Widget build(BuildContext context) {\n    // TODO: build the integrated app described in the brief.\n    return const Scaffold(body: Text('TODO'));\n  }\n}\n");

const rubricFor = (ms: { task: TaskDef; weight: number }[]) => [
  ...ms.map((m, i) => `Milestone ${i + 1} (${m.weight} pts): ${m.task.tests.length} automated acceptance tests — ${m.task.kind === 'ui' ? 'structural + interaction checks on the rendered widget tree' : 'unit tests executed by the interpreter'}.`),
  'Each milestone: 10% parses, 10% required structure, 80% split across tests. A milestone passes at ≥ 70%.',
  'The project is complete when every milestone passes; the project score is the sum of passed milestone weights.',
];
const P = (id: string, title: string, level: Level, unlockAfter: number, summary: string, skills: string[], requirements: string[], ms: [TaskDef, number][], capstone = false): Project => {
  const milestones = ms.map(([task, weight]) => ({ task, weight }));
  return { id, title, level, unlockAfter, summary, skills, requirements, milestones, rubric: rubricFor(milestones), capstone };
};

export const PROJECTS: Project[] = [
  P('profile-card', 'Profile card', 'Beginner', 27, 'Compose a polished profile card, then make its Follow button interactive.', ['Layout', 'Card', 'setState'], ['Card with avatar, name, role and contact icons', 'Follow/Following toggle with a follower count'], [[profileCard, 50], [followCard, 50]]),
  P('counter', 'Counter application', 'Beginner', 19, 'From a basic counter to a bounded counter with disabled states and reset.', ['StatefulWidget', 'Disabled buttons', 'Conditional UI'], ['Increment with setState', 'Clamp 0–10, disable buttons at the limits', 'Show a limit message and reset'], [[TASKS[17], 40], [boundedCounter, 60]]),
  P('settings', 'Interactive settings screen', 'Beginner', 41, 'A profile screen plus a settings panel using switches, sliders and dropdowns.', ['Selection controls', 'Controlled widgets'], ['Profile header with dark-mode switch', 'Switch, Slider and DropdownButton each bound to state'], [[TASKS[29], 40], [settingsScreen, 60]]),
  P('calculator', 'Calculator', 'Beginner', 29, 'Separate the calculation engine from the UI, then wire up a calculator screen.', ['Pure functions', 'Input parsing', 'Error messages'], ['Null-safe calculation engine', 'Two inputs, four operators, validation messages'], [[calcLogic, 40], [calcUi, 60]]),
  P('quiz', 'Quiz application', 'Beginner', 30, 'A quiz engine class and a one-question-at-a-time quiz screen with scoring.', ['Classes', 'State machines', 'Collection-for'], ['Quiz class with answer/score/isFinished', 'Question flow, results view and restart'], [[quizLogic, 40], [quizUi, 60]]),
  P('todo', 'Todo manager with SQLite-style storage', 'Intermediate', 56, 'Model CRUD storage with primary keys, then build a task list with completion state.', ['CRUD', 'Lists', 'Checkboxes'], ['CRUD table with auto-increment ids', 'Task list with add, validation and completion counts'], [[TASKS[55], 50], [todoUi, 50]]),
  P('catalog', 'Searchable product catalog', 'Intermediate', 40, 'Search, filter and sort local product data, then present it with live search.', ['Filtering', 'Sorting', 'Empty states'], ['Case-insensitive search with optional price filter', 'Live search screen with result count and empty state'], [[catalogLogic, 50], [catalogUi, 50]]),
  P('records', 'Form-based record manager', 'Intermediate', 37, 'Validators as pure functions, then a validated Form that manages records.', ['Form', 'Validation', 'Controllers'], ['Reusable email validator', 'Form with name/age validation, save and clear'], [[TASKS[35], 30], [recordUi, 70]]),
  P('notes', 'Multi-screen notes app', 'Intermediate', 43, 'Navigation with push/pop, data passed to screens and results returned via callbacks.', ['Navigator', 'Route data', 'Callbacks'], ['Push and pop a details screen', 'List → detail → editor flow with validation'], [[TASKS[41], 30], [notesUi, 70]]),
  P('api', 'API-driven app with local fixtures', 'Intermediate', 52, 'Handle status codes and malformed JSON, then build loading/error/retry UI against an offline fixture API.', ['JSON', 'Error handling', 'Async UI states'], ['Response classification incl. bad data', 'Idle/error/retry/data states with mounted checks'], [[apiLogic, 40], [apiUi, 60]]),
  P('expenses', 'Repository-based expense tracker', 'Advanced', 65, 'A repository interface, a service with business rules, and a UI that only talks to the service.', ['Repository pattern', 'Services', 'Aggregation'], ['Repository abstraction + in-memory implementation', 'Expense screen with validation and per-category totals'], [[expenseLogic, 50], [expenseUi, 50]]),
  P('inventory', 'Offline-first inventory manager', 'Advanced', 57, 'Local-first stock changes with a pending sync queue.', ['Offline-first', 'Sync queues', 'Invariants'], ['Identify pending records', 'Inventory with non-negative stock and sync(online)'], [[TASKS[56], 30], [inventoryLogic, 70]]),
  P('auth', 'Authentication-flow simulation', 'Advanced', 94, 'An AuthService with lockout rules and a login → home → logout flow.', ['Session lifecycle', 'Navigation', 'Security rules'], ['Login with normalisation, lockout and logout', 'Login screen, welcome screen and logout navigation'], [[authLogic, 50], [authUi, 50]]),
  P('dashboard', 'State-managed dashboard with tests', 'Advanced', 104, 'A ChangeNotifier dashboard model and a test suite that must catch seeded bugs.', ['ChangeNotifier', 'Derived state', 'Unit testing', 'Mutation testing'], ['Model with derived metrics and notifications', 'Tests that fail on two injected bugs'], [[dashLogic, 50], [dashTests, 50]]),
  P('capstone', 'Capstone: integrated task application', 'Advanced', 119, 'Independently combine navigation, state management, persistence, validation, error handling, responsive design and testing in one application.', ['Navigation', 'State management', 'Persistence', 'Validation', 'Error handling', 'Responsive design', 'Testing'], ['Domain layer with validation and JSON persistence', 'Automated tests that catch seeded bugs', 'Integrated UI: list/detail navigation, two-pane tablet layout, persisted changes, suggestions with retry'], [[capStore, 30], [capTests, 20], [capUi, 50]], true),
];
export const ALL_PROJECT_TASKS = PROJECTS.flatMap((p) => p.milestones.map((m) => m.task));
