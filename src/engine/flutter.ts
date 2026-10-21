// Controlled Flutter widget subset: allow-listed widgets, styling types, State lifecycle,
// navigation, forms and a resolver that builds an element tree (RNode) for the preview.
import { parseProgram } from './parser';
import { registerColor } from './sourceEdit';
import type { Interpreter } from './runtime';
import { NObj, NType, NativeFn, DInstance, DEnumValue, DDouble, Closure, DClass, isNum, numVal, typeName, EngineError } from './values';

export const FLUTTER_PRELUDE = `
abstract class Widget { final key; const Widget({this.key}); }
abstract class StatelessWidget extends Widget { const StatelessWidget({super.key}); Widget build(BuildContext context); }
abstract class StatefulWidget extends Widget { const StatefulWidget({super.key}); State createState(); }
abstract class State {
  var widget; var context; bool mounted = false;
  void initState() {}
  void didUpdateWidget(oldWidget) {}
  void dispose() {}
  void setState(fn) {
    if (!mounted) { throw StateError('setState() called after dispose(): this State object is no longer in the widget tree. Check "mounted" first.'); }
    fn();
    __markDirty(this);
  }
  Widget build(BuildContext context);
}
`;
let flutterAst: any = null;

type Spec = { pos?: string[]; named: string };
const BTN = 'onPressed! child! style onLongPress autofocus';
const BTN_ICON = 'onPressed! icon! label! style';
export const WIDGETS: Record<string, Spec> = {
  MaterialApp: { named: 'home title theme darkTheme themeMode debugShowCheckedModeBanner routes initialRoute' },
  Scaffold: { named: 'appBar body floatingActionButton bottomNavigationBar backgroundColor drawer' },
  AppBar: { named: 'title leading actions backgroundColor foregroundColor centerTitle elevation automaticallyImplyLeading' },
  Text: { pos: ['data!'], named: 'style textAlign maxLines overflow softWrap semanticsLabel' },
  Icon: { pos: ['icon!'], named: 'color size semanticLabel' },
  Container: { named: 'child color width height padding margin decoration alignment constraints' },
  AnimatedContainer: { named: 'child color width height padding margin decoration alignment duration! curve' },
  Padding: { named: 'padding! child' },
  SizedBox: { named: 'width height child' },
  'SizedBox.shrink': { named: 'child' },
  'SizedBox.expand': { named: 'child' },
  Center: { named: 'child widthFactor heightFactor' },
  Align: { named: 'alignment child' },
  Row: { named: 'children mainAxisAlignment crossAxisAlignment mainAxisSize spacing' },
  Column: { named: 'children mainAxisAlignment crossAxisAlignment mainAxisSize spacing' },
  Expanded: { named: 'child! flex' },
  Flexible: { named: 'child! flex fit' },
  Spacer: { named: 'flex' },
  Stack: { named: 'children alignment fit clipBehavior' },
  Positioned: { named: 'child! top left right bottom width height' },
  ListView: { named: 'children padding scrollDirection shrinkWrap physics reverse' },
  'ListView.builder': { named: 'itemCount itemBuilder! padding scrollDirection shrinkWrap physics' },
  'ListView.separated': { named: 'itemCount! itemBuilder! separatorBuilder! padding shrinkWrap physics' },
  'GridView.count': { named: 'crossAxisCount! children mainAxisSpacing crossAxisSpacing childAspectRatio padding shrinkWrap physics' },
  SingleChildScrollView: { named: 'child padding scrollDirection' },
  Card: { named: 'child color elevation margin shape' },
  ListTile: { named: 'title subtitle leading trailing onTap onLongPress selected dense enabled tileColor' },
  Divider: { named: 'height thickness color indent endIndent' },
  ElevatedButton: { named: BTN }, TextButton: { named: BTN }, OutlinedButton: { named: BTN }, FilledButton: { named: BTN },
  'ElevatedButton.icon': { named: BTN_ICON }, 'TextButton.icon': { named: BTN_ICON }, 'OutlinedButton.icon': { named: BTN_ICON }, 'FilledButton.icon': { named: BTN_ICON },
  IconButton: { named: 'icon! onPressed! tooltip color iconSize' },
  FloatingActionButton: { named: 'onPressed! child tooltip backgroundColor' },
  TextField: { named: 'controller onChanged onSubmitted decoration obscureText keyboardType maxLines enabled autofocus focusNode textInputAction' },
  TextFormField: { named: 'controller onChanged onFieldSubmitted decoration obscureText keyboardType maxLines enabled autofocus focusNode validator initialValue onSaved textInputAction' },
  Form: { named: 'key child! autovalidateMode' },
  Switch: { named: 'value! onChanged! activeColor' },
  Checkbox: { named: 'value! onChanged! activeColor' },
  SwitchListTile: { named: 'value! onChanged! title subtitle' },
  CheckboxListTile: { named: 'value! onChanged! title subtitle' },
  Slider: { named: 'value! onChanged! min max divisions label' },
  DropdownButton: { named: 'value items! onChanged! hint isExpanded' },
  DropdownMenuItem: { named: 'value child!' },
  CircleAvatar: { named: 'child radius backgroundColor foregroundColor' },
  'Image.network': { pos: ['src!'], named: 'width height fit' },
  'Image.asset': { pos: ['name!'], named: 'width height fit' },
  GestureDetector: { named: 'child onTap onDoubleTap onLongPress behavior' },
  InkWell: { named: 'child onTap onLongPress borderRadius' },
  Wrap: { named: 'children spacing runSpacing alignment' },
  Opacity: { named: 'opacity! child' },
  AnimatedOpacity: { named: 'opacity! duration! child curve' },
  AspectRatio: { named: 'aspectRatio! child' },
  Tooltip: { named: 'message! child' },
  Semantics: { named: 'label child button header hint' },
  CircularProgressIndicator: { named: 'value color strokeWidth' },
  LinearProgressIndicator: { named: 'value color backgroundColor minHeight' },
  Visibility: { named: 'visible child! replacement' },
  SafeArea: { named: 'child!' },
  Builder: { named: 'builder!' },
  LayoutBuilder: { named: 'builder!' },
  Hero: { named: 'tag! child!' },
  Placeholder: { named: 'color fallbackHeight fallbackWidth' },
  Chip: { named: 'label! avatar onDeleted backgroundColor' },
  BottomNavigationBar: { named: 'items! currentIndex onTap' },
  BottomNavigationBarItem: { named: 'icon! label' },
  ConstrainedBox: { named: 'constraints! child' },
  SnackBar: { named: 'content! duration action' },
  AlertDialog: { named: 'title content actions' },
};
const NON_WIDGET = new Set(['BottomNavigationBarItem', 'DropdownMenuItem', 'SnackBar']);

const COLORS: Record<string, number> = {
  red: 0xfff44336, pink: 0xffe91e63, purple: 0xff9c27b0, deepPurple: 0xff673ab7, indigo: 0xff3f51b5, blue: 0xff2196f3, lightBlue: 0xff03a9f4,
  cyan: 0xff00bcd4, teal: 0xff009688, green: 0xff4caf50, lightGreen: 0xff8bc34a, lime: 0xffcddc39, yellow: 0xffffeb3b, amber: 0xffffc107,
  orange: 0xffff9800, deepOrange: 0xffff5722, brown: 0xff795548, grey: 0xff9e9e9e, blueGrey: 0xff607d8b,
};
const PLAIN: Record<string, number> = { white: 0xffffffff, black: 0xff000000, transparent: 0x00000000, white70: 0xb3ffffff, white54: 0x8affffff, white24: 0x3dffffff, black87: 0xdd000000, black54: 0x8a000000, black45: 0x73000000, black26: 0x42000000, black12: 0x1f000000 };

export const ICONS: Record<string, string> = {
  add: '+', remove: '−', home: '⌂', star: '★', star_border: '☆', favorite: '♥', favorite_border: '♡', settings: '⚙', person: '👤', people: '👥',
  delete: '🗑', search: '🔍', menu: '☰', check: '✓', check_circle: '✔', close: '✕', clear: '✕', arrow_back: '←', arrow_forward: '→',
  arrow_upward: '↑', arrow_downward: '↓', chevron_right: '›', chevron_left: '‹', edit: '✎', info: 'ℹ', email: '✉', mail: '✉', phone: '☎',
  lock: '🔒', lock_open: '🔓', notifications: '🔔', camera_alt: '📷', camera: '📷', photo: '🖼', image: '🖼', thumb_up: '👍', thumb_down: '👎',
  refresh: '⟳', share: '⤴', shopping_cart: '🛒', dark_mode: '☾', light_mode: '☀', wifi: '📶', cloud: '☁', cloud_off: '⛅', list: '≡',
  task_alt: '☑', calendar_today: '📅', access_time: '🕒', timer: '⏱', play_arrow: '▶', pause: '⏸', stop: '■', music_note: '♪', map: '🗺',
  location_on: '📍', school: '🎓', book: '📖', code: '⌨', bug_report: '🐞', warning: '⚠', error: 'ⓧ', help: '?', visibility: '👁',
  visibility_off: '◌', save: '💾', download: '⬇', upload: '⬆', send: '➤', logout: '⇥', login: '⇤', account_circle: '◉', more_vert: '⋮',
  more_horiz: '⋯', bookmark: '🔖', flag: '⚑', language: '🌐', palette: '🎨', attach_file: '📎', note: '🗒', sort: '⇅', filter_list: '⫶',
  done: '✓', done_all: '✓✓', label: '🏷', shopping_bag: '👜', local_cafe: '☕', directions_car: '🚗', flight: '✈', sunny: '☀', bolt: '⚡',
  sync: '⟲', storage: '🗄', security: '🛡', speed: '⏲', touch_app: '☝', swipe: '↔', brush: '🖌', circle: '●', square: '■',
};

function mkColor(v: number) { return new NObj('Color', { value: v >>> 0 }); }
export function argb(c: any): string | undefined {
  if (!(c instanceof NObj) || (c.kind !== 'Color' && c.kind !== 'MaterialColor')) return undefined;
  const v = c.props.value >>> 0;
  const a = ((v >>> 24) & 255) / 255, r = (v >>> 16) & 255, g = (v >>> 8) & 255, b = v & 255;
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
function mix(v: number, t: number, target: number) {
  const ch = (s: number) => { const x = (v >>> s) & 255; const y = (target >>> s) & 255; return Math.round(x + (y - x) * t); };
  return ((0xff << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
}
function materialColor(v: number) {
  const shades: Record<string, any> = {};
  const map: [number, number, number][] = [[50, 0.9, 0xffffffff], [100, 0.75, 0xffffffff], [200, 0.55, 0xffffffff], [300, 0.35, 0xffffffff], [400, 0.15, 0xffffffff], [500, 0, 0], [600, 0.1, 0xff000000], [700, 0.22, 0xff000000], [800, 0.34, 0xff000000], [900, 0.48, 0xff000000]];
  for (const [n, t, tg] of map) shades['shade' + n] = mkColor(t ? mix(v, t, tg) : v);
  return shades;
}

const enumNS = (name: string, values: string[]) => new NType(name, Object.fromEntries(values.map((v, i) => [v, new DEnumValue(name, v, i)])));

export function isWidgetLike(_I: Interpreter, v: any) { return (v instanceof NObj && v.isWidget) || (v instanceof DInstance && v.cls.isSubOf('Widget')); }

export function installFlutter(I: Interpreter) {
  const g = I.globals;
  if (!flutterAst) flutterAst = parseProgram(FLUTTER_PRELUDE);
  const nf = (name: string, fn: (a: any[], n: Record<string, any>) => any) => new NativeFn(name, fn);
  // setState marks only its own State dirty; unmarked States reuse their last build output (Flutter semantics).
  g.declare('__markDirty', nf('__markDirty', (a) => { I.dirty = true; if (a[0]) (I.hooks.dirtyStates ??= new Set()).add(a[0]); return null; }), true);
  I.declareAll(flutterAst.decls, true);

  const make = (full: string, spec: Spec) => (a: any[], n: Record<string, any>) => {
    const pos = spec.pos ?? [];
    const named = spec.named.split(' ').filter(Boolean);
    if (a.length > pos.length) I.cerr(`Too many positional arguments to '${full}': ${pos.length} expected, ${a.length} given.${pos.length === 0 ? ` Use named arguments like '${named[0].replace('!', '')}: ...'.` : ''}`);
    const props: Record<string, any> = {};
    pos.forEach((p, i) => { const nm = p.replace('!', ''); if (i >= a.length) { if (p.endsWith('!')) I.cerr(`'${full}' requires a positional argument '${nm}'.`); } else props[nm] = a[i]; });
    const allowed = new Set(named.map((x) => x.replace('!', '')).concat(['key']));
    for (const k of Object.keys(n)) if (!allowed.has(k)) I.cerr(`No named parameter with the name '${k}' in '${full}'.`);
    for (const x of named) if (x.endsWith('!') && !(x.slice(0, -1) in n)) I.cerr(`The named parameter '${x.slice(0, -1)}' is required in '${full}'.`);
    Object.assign(props, n);
    validate(I, full, props);
    const base = full.split('.')[0];
    return new NObj(base, props, !NON_WIDGET.has(base), full.includes('.') ? full.split('.')[1] : '');
  };
  const byBase: Record<string, Record<string, any>> = {};
  for (const [full, spec] of Object.entries(WIDGETS)) {
    const [base, ctor] = full.split('.');
    byBase[base] ??= {};
    byBase[base][ctor ?? ''] = make(full, spec);
  }
  for (const [base, ctors] of Object.entries(byBase)) {
    const statics: Record<string, any> = {};
    for (const [c, fn] of Object.entries(ctors)) if (c) statics[c] = nf(`${base}.${c}`, fn);
    g.declare(base, new NType(base, statics, ctors[''] ?? ((): any => I.cerr(`'${base}' must be created with a named constructor: ${Object.keys(statics).map((s) => base + '.' + s).join(', ')}.`))), true);
  }
  g.declare('Image', new NType('Image', { network: nf('Image.network', byBase.Image.network), asset: nf('Image.asset', byBase.Image.asset) }, () => I.cerr("Use Image.network(url) or Image.asset(path). (The offline preview shows a placeholder for images.)")), true);

  g.declare('runApp', nf('runApp', (a) => {
    if (!isWidgetLike(I, a[0])) I.cerr(`runApp() expects a Widget but got '${typeName(a[0])}'.`);
    I.rootWidget = a[0]; return null;
  }), true);

  // Colors
  const colorStatics: Record<string, any> = {};
  for (const [k, v] of Object.entries(COLORS)) colorStatics[k] = new NObj('MaterialColor', { value: v, ...materialColor(v) });
  for (const [k, v] of Object.entries(PLAIN)) colorStatics[k] = mkColor(v);
  for (const [k, v] of Object.entries({ ...COLORS, ...PLAIN })) registerColor(k, v);
  g.declare('Colors', new NType('Colors', colorStatics), true);
  g.declare('Color', new NType('Color', {
    fromARGB: nf('Color.fromARGB', (a) => mkColor(((a[0] & 255) << 24) | ((a[1] & 255) << 16) | ((a[2] & 255) << 8) | (a[3] & 255))),
    fromRGBO: nf('Color.fromRGBO', (a) => mkColor((Math.round(numVal(a[3]) * 255) << 24) | ((a[0] & 255) << 16) | ((a[1] & 255) << 8) | (a[2] & 255))),
  }, (a) => { if (typeof a[0] !== 'number') I.cerr('Color() expects an int like 0xFF2196F3.'); return mkColor(a[0]); }), true);

  const icons: Record<string, any> = {};
  for (const k of Object.keys(ICONS)) icons[k] = new NObj('IconData', { name: k });
  g.declare('Icons', new NType('Icons', new Proxy(icons, {
    has: (t, k) => k in t || typeof k === 'string',
    get: (t, k: string) => { if (k in t) return t[k]; I.cerr(`Icons.${k} is not in the offline preview icon set. Try one of: add, home, star, favorite, settings, person, delete, search, check, close, edit, info.`); },
  })), true);

  const ei = (l: any, t: any, r: any, b: any) => new NObj('EdgeInsets', { left: numVal(l ?? 0), top: numVal(t ?? 0), right: numVal(r ?? 0), bottom: numVal(b ?? 0) });
  g.declare('EdgeInsets', new NType('EdgeInsets', {
    all: nf('EdgeInsets.all', (a) => { if (!isNum(a[0])) I.cerr('EdgeInsets.all expects a number.'); return ei(a[0], a[0], a[0], a[0]); }),
    symmetric: nf('EdgeInsets.symmetric', (_a, n) => ei(n.horizontal, n.vertical, n.horizontal, n.vertical)),
    only: nf('EdgeInsets.only', (_a, n) => ei(n.left, n.top, n.right, n.bottom)),
    fromLTRB: nf('EdgeInsets.fromLTRB', (a) => ei(a[0], a[1], a[2], a[3])),
    zero: ei(0, 0, 0, 0),
  }), true);
  g.declare('Radius', new NType('Radius', { circular: nf('Radius.circular', (a) => new NObj('Radius', { r: numVal(a[0]) })) }), true);
  g.declare('BorderRadius', new NType('BorderRadius', {
    circular: nf('BorderRadius.circular', (a) => new NObj('BorderRadius', { r: numVal(a[0]) })),
    all: nf('BorderRadius.all', (a) => new NObj('BorderRadius', { r: a[0]?.props?.r ?? 0 })),
    zero: new NObj('BorderRadius', { r: 0 }),
  }), true);
  const obj = (name: string, allowed: string, extra?: (p: any) => void) => new NType(name, {}, (_a, n) => {
    const ok = new Set(allowed.split(' '));
    for (const k of Object.keys(n)) if (!ok.has(k)) I.cerr(`No named parameter with the name '${k}' in '${name}'.`);
    const p = { ...n }; extra?.(p); return new NObj(name, p);
  });
  g.declare('BoxDecoration', obj('BoxDecoration', 'color borderRadius border boxShadow shape gradient image'), true);
  g.declare('Border', new NType('Border', { all: nf('Border.all', (_a, n) => new NObj('Border', { color: n.color ?? mkColor(0xff000000), width: numVal(n.width ?? 1) })) }), true);
  g.declare('BoxShadow', obj('BoxShadow', 'color blurRadius offset spreadRadius'), true);
  g.declare('Offset', new NType('Offset', { zero: new NObj('Offset', { dx: 0, dy: 0 }) }, (a) => new NObj('Offset', { dx: numVal(a[0]), dy: numVal(a[1]) })), true);
  g.declare('LinearGradient', obj('LinearGradient', 'colors begin end'), true);
  g.declare('BoxConstraints', new NType('BoxConstraints', {}, (_a, n) => new NObj('BoxConstraints', { ...n })), true);
  g.declare('RoundedRectangleBorder', obj('RoundedRectangleBorder', 'borderRadius side'), true);
  g.declare('OutlineInputBorder', obj('OutlineInputBorder', 'borderRadius borderSide'), true);
  g.declare('UnderlineInputBorder', obj('UnderlineInputBorder', 'borderSide'), true);
  g.declare('InputDecoration', obj('InputDecoration', 'labelText hintText border prefixIcon suffixIcon errorText helperText filled fillColor counterText'), true);
  g.declare('TextStyle', new NType('TextStyle', {}, (_a, n) => {
    const ok = new Set('fontSize fontWeight color fontStyle letterSpacing height decoration fontFamily backgroundColor'.split(' '));
    for (const k of Object.keys(n)) if (!ok.has(k)) I.cerr(`No named parameter with the name '${k}' in 'TextStyle'.`);
    const ts: NObj = new NObj('TextStyle', { ...n });
    ts.props.copyWith = nf('copyWith', (_x, m) => new NObj('TextStyle', { ...ts.props, ...m }));
    return ts;
  }), true);
  g.declare('FontWeight', new NType('FontWeight', Object.fromEntries([['normal', 400], ['bold', 700], ...[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ['w' + w, w])].map(([k, w]) => [k, new NObj('FontWeight', { weight: w })]))), true);
  g.declare('FontStyle', enumNS('FontStyle', ['normal', 'italic']), true);
  g.declare('TextAlign', enumNS('TextAlign', ['left', 'right', 'center', 'justify', 'start', 'end']), true);
  g.declare('TextOverflow', enumNS('TextOverflow', ['clip', 'fade', 'ellipsis', 'visible']), true);
  g.declare('TextDecoration', enumNS('TextDecoration', ['none', 'underline', 'lineThrough', 'overline']), true);
  g.declare('MainAxisAlignment', enumNS('MainAxisAlignment', ['start', 'end', 'center', 'spaceBetween', 'spaceAround', 'spaceEvenly']), true);
  g.declare('CrossAxisAlignment', enumNS('CrossAxisAlignment', ['start', 'end', 'center', 'stretch', 'baseline']), true);
  g.declare('MainAxisSize', enumNS('MainAxisSize', ['min', 'max']), true);
  g.declare('Axis', enumNS('Axis', ['horizontal', 'vertical']), true);
  g.declare('BoxShape', enumNS('BoxShape', ['rectangle', 'circle']), true);
  g.declare('BoxFit', enumNS('BoxFit', ['fill', 'contain', 'cover', 'fitWidth', 'fitHeight', 'none', 'scaleDown']), true);
  g.declare('FlexFit', enumNS('FlexFit', ['tight', 'loose']), true);
  g.declare('StackFit', enumNS('StackFit', ['loose', 'expand', 'passthrough']), true);
  g.declare('Clip', enumNS('Clip', ['none', 'hardEdge', 'antiAlias', 'antiAliasWithSaveLayer']), true);
  g.declare('Curves', enumNS('Curves', ['linear', 'ease', 'easeIn', 'easeOut', 'easeInOut', 'bounceOut', 'elasticOut', 'fastOutSlowIn']), true);
  g.declare('ThemeMode', enumNS('ThemeMode', ['system', 'light', 'dark']), true);
  g.declare('Brightness', enumNS('Brightness', ['light', 'dark']), true);
  g.declare('TextInputType', enumNS('TextInputType', ['text', 'number', 'emailAddress', 'phone', 'multiline', 'url', 'visiblePassword']), true);
  g.declare('TextInputAction', enumNS('TextInputAction', ['done', 'next', 'search', 'send', 'go']), true);
  g.declare('AutovalidateMode', enumNS('AutovalidateMode', ['disabled', 'always', 'onUserInteraction']), true);
  g.declare('HitTestBehavior', enumNS('HitTestBehavior', ['deferToChild', 'opaque', 'translucent']), true);
  const scroll = new NObj('ScrollPhysics', {});
  g.declare('NeverScrollableScrollPhysics', new NType('NeverScrollableScrollPhysics', {}, () => scroll), true);
  g.declare('BouncingScrollPhysics', new NType('BouncingScrollPhysics', {}, () => scroll), true);
  g.declare('Alignment', new NType('Alignment', Object.fromEntries(['topLeft', 'topCenter', 'topRight', 'centerLeft', 'center', 'centerRight', 'bottomLeft', 'bottomCenter', 'bottomRight'].map((k) => [k, new NObj('Alignment', { name: k })])), (a) => new NObj('Alignment', { name: 'custom', x: numVal(a[0]), y: numVal(a[1]) })), true);

  // Keys
  g.declare('ValueKey', new NType('ValueKey', {}, (a) => new NObj('Key', { value: a[0], k: 'v:' + I.str(a[0]) })), true);
  g.declare('Key', new NType('Key', {}, (a) => new NObj('Key', { value: a[0], k: 'k:' + I.str(a[0]) })), true);
  g.declare('ObjectKey', new NType('ObjectKey', {}, (a) => new NObj('Key', { value: a[0], k: 'o:' + (a[0]?.id ?? I.str(a[0])) })), true);
  let uk = 0;
  g.declare('UniqueKey', new NType('UniqueKey', {}, () => new NObj('Key', { k: 'u:' + ++uk })), true);
  g.declare('GlobalKey', new NType('GlobalKey', {}, () => {
    const key: NObj = new NObj('GlobalKey', { k: 'g:' + ++uk, __fields: [] as any[] });
    const fs: NObj = new NObj('FormState', {});
    fs.props.validate = nf('validate', () => {
      let ok = true;
      for (const f of key.props.__fields) { const err = f.validator ? I.callValue(f.validator, [f.getText()]) : null; f.setError(err); if (err !== null) ok = false; }
      I.dirty = true; return ok;
    });
    fs.props.save = nf('save', () => { for (const f of key.props.__fields) if (f.onSaved) I.callValue(f.onSaved, [f.getText()]); return null; });
    fs.props.reset = nf('reset', () => { for (const f of key.props.__fields) { f.setText(''); f.setError(null); } I.dirty = true; return null; });
    key.props.currentState = fs;
    return key;
  }), true);

  // Controllers
  g.declare('TextEditingController', new NType('TextEditingController', {}, (_a, n) => {
    const c: NObj = new NObj('TextEditingController', { text: n.text ?? '', __settable: ['text'], __listeners: [] as any[] });
    c.props.__onSet = () => { for (const l of c.props.__listeners) I.callValue(l, []); };
    c.props.clear = nf('clear', () => { c.props.text = ''; c.props.__onSet(); I.dirty = true; return null; });
    c.props.dispose = nf('dispose', () => { c.props.disposed = true; return null; });
    c.props.addListener = nf('addListener', (a) => { c.props.__listeners.push(a[0]); return null; });
    c.props.removeListener = nf('removeListener', (a) => { c.props.__listeners = c.props.__listeners.filter((x: any) => x !== a[0]); return null; });
    return c;
  }), true);
  g.declare('FocusNode', new NType('FocusNode', {}, () => {
    const f: NObj = new NObj('FocusNode', { hasFocus: false });
    f.props.requestFocus = nf('requestFocus', () => { f.props.hasFocus = true; I.hooks.focused = f; I.dirty = true; return null; });
    f.props.unfocus = nf('unfocus', () => { f.props.hasFocus = false; if (I.hooks.focused === f) I.hooks.focused = null; I.dirty = true; return null; });
    f.props.dispose = nf('dispose', () => null);
    return f;
  }), true);

  // Theme / MediaQuery / Navigator
  const scheme = (seed: number, dark: boolean) => new NObj('ColorScheme', {
    primary: mkColor(dark ? mix(seed, 0.45, 0xffffffff) : mix(seed, 0.15, 0xff000000)), onPrimary: mkColor(dark ? 0xff1c1b1f : 0xffffffff),
    primaryContainer: mkColor(dark ? mix(seed, 0.6, 0xff000000) : mix(seed, 0.8, 0xffffffff)), secondary: mkColor(mix(seed, 0.35, 0xff808080)),
    surface: mkColor(dark ? 0xff1c1b1f : 0xfffffbfe), onSurface: mkColor(dark ? 0xffe6e1e5 : 0xff1c1b1f), error: mkColor(0xffb3261e),
    inversePrimary: mkColor(dark ? mix(seed, 0.15, 0xff000000) : mix(seed, 0.55, 0xffffffff)), brightness: new DEnumValue('Brightness', dark ? 'dark' : 'light', dark ? 1 : 0),
  });
  const theme = (n: Record<string, any>) => {
    const dark = n.brightness?.name === 'dark';
    const seed = n.colorSchemeSeed?.props?.value ?? n.colorScheme?.props?.primary?.props?.value ?? n.primarySwatch?.props?.value ?? n.primaryColor?.props?.value ?? 0xff6750a4;
    const cs = n.colorScheme ?? scheme(seed, dark);
    return new NObj('ThemeData', { colorScheme: cs, brightness: cs.props.brightness, useMaterial3: n.useMaterial3 ?? true, scaffoldBackgroundColor: n.scaffoldBackgroundColor ?? cs.props.surface, primaryColor: cs.props.primary });
  };
  I.hooks.defaultTheme = theme({});
  g.declare('ThemeData', new NType('ThemeData', { light: nf('ThemeData.light', () => theme({})), dark: nf('ThemeData.dark', () => theme({ brightness: new DEnumValue('Brightness', 'dark', 1) })) }, (_a, n) => theme(n)), true);
  g.declare('ColorScheme', new NType('ColorScheme', { fromSeed: nf('ColorScheme.fromSeed', (_a, n) => scheme(n.seedColor.props.value, n.brightness?.name === 'dark')) }), true);
  const ctxOf = (c: any) => { if (!(c instanceof NObj) || c.kind !== 'BuildContext') I.cerr('Expected a BuildContext (the "context" parameter of build).'); return c; };
  g.declare('Theme', new NType('Theme', { of: nf('Theme.of', (a) => ctxOf(a[0]).props.theme) }), true);
  g.declare('MediaQuery', new NType('MediaQuery', {
    of: nf('MediaQuery.of', (a) => new NObj('MediaQueryData', { size: ctxOf(a[0]).props.size })),
    sizeOf: nf('MediaQuery.sizeOf', (a) => ctxOf(a[0]).props.size),
  }), true);
  g.declare('MaterialPageRoute', new NType('MaterialPageRoute', {}, (_a, n) => { if (!n.builder) I.cerr("MaterialPageRoute requires 'builder'."); return new NObj('MaterialPageRoute', { builder: n.builder, settings: n.settings ?? null }); }), true);
  g.declare('RouteSettings', new NType('RouteSettings', {}, (_a, n) => new NObj('RouteSettings', { name: n.name ?? null, arguments: n.arguments ?? null })), true);
  const push = (route: any) => { if (!(route instanceof NObj) || route.kind !== 'MaterialPageRoute') I.cerr('Navigator.push expects a MaterialPageRoute.'); I.routeStack.push(route); I.dirty = true; return null; };
  g.declare('Navigator', new NType('Navigator', {
    push: nf('Navigator.push', (a) => { ctxOf(a[0]); push(a[1]); return null; }),
    pushReplacement: nf('Navigator.pushReplacement', (a) => { ctxOf(a[0]); I.routeStack.pop(); push(a[1]); return null; }),
    pushNamed: nf('Navigator.pushNamed', (a, n) => {
      ctxOf(a[0]);
      const b = I.namedRoutes?.get(a[1]);
      if (!b) I.throwDart('StateError', `Could not find a generator for route RouteSettings("${a[1]}"). Add it to MaterialApp.routes.`);
      I.routeStack.push(new NObj('MaterialPageRoute', { builder: b, settings: new NObj('RouteSettings', { name: a[1], arguments: n.arguments ?? null }) }));
      I.dirty = true; return null;
    }),
    pop: nf('Navigator.pop', (a) => {
      ctxOf(a[0]);
      if (I.hooks.dialogs?.length) { I.hooks.dialogs.pop(); I.dirty = true; return null; }
      if (!I.routeStack.length) { I.print('[preview] Navigator.pop ignored: already at the first route.'); return null; }
      I.routeStack.pop(); I.hooks.lastPopResult = a[1] ?? null; I.dirty = true; return null;
    }),
    canPop: nf('Navigator.canPop', () => I.routeStack.length > 0),
  }), true);
  g.declare('ModalRoute', new NType('ModalRoute', { of: nf('ModalRoute.of', (a) => { const s = ctxOf(a[0]).props.route; return new NObj('ModalRoute', { settings: s ?? new NObj('RouteSettings', { name: '/', arguments: null }) }); }) }), true);
  g.declare('ScaffoldMessenger', new NType('ScaffoldMessenger', { of: nf('ScaffoldMessenger.of', (a) => { ctxOf(a[0]); return new NObj('ScaffoldMessengerState', { showSnackBar: nf('showSnackBar', (b) => { I.hooks.snack = b[0]; I.dirty = true; return null; }), hideCurrentSnackBar: nf('hide', () => { I.hooks.snack = null; I.dirty = true; return null; }) }); }) }), true);
  g.declare('showDialog', nf('showDialog', (_a, n) => { ctxOf(n.context); (I.hooks.dialogs ??= []).push(n.builder); I.dirty = true; return null; }), true);
}

function validate(I: Interpreter, full: string, p: Record<string, any>) {
  const w = (v: any, what: string) => { if (v !== undefined && v !== null && !isWidgetLike(I, v)) I.cerr(`The argument '${what}' of '${full}' must be a Widget, but got '${typeName(v)}'.${typeof v === 'string' ? ` Wrap it: Text('${v}')` : ''}`); };
  const ws = (v: any, what: string) => { if (v === undefined) return; if (!Array.isArray(v)) I.cerr(`'${what}' of '${full}' must be a List<Widget>.`); v.forEach((x: any, i: number) => { if (!isWidgetLike(I, x)) I.cerr(`'${what}[${i}]' of '${full}' must be a Widget, but got '${typeName(x)}'.${typeof x === 'string' ? ` Wrap it: Text('${x}')` : ''}`); }); };
  for (const k of ['child', 'body', 'home', 'appBar', 'floatingActionButton', 'leading', 'trailing', 'subtitle', 'replacement', 'avatar', 'content', 'bottomNavigationBar', 'hint']) if (k in p) w(p[k], k);
  if ('title' in p && full !== 'MaterialApp') w(p.title, 'title');
  if (('label' in p) && full !== 'Semantics' && full !== 'BottomNavigationBarItem' && full !== 'Slider') w(p.label, 'label');
  if ('icon' in p && full !== 'Icon' && full !== 'BottomNavigationBarItem') w(p.icon, 'icon');
  for (const k of ['children', 'actions']) if (k in p) ws(p[k], k);
  if (full === 'Text' && typeof p.data !== 'string') I.cerr(`Text() expects a String but got '${typeName(p.data)}'. Use interpolation: Text('\$value') or value.toString().`);
  if (full === 'Icon' && !(p.icon instanceof NObj && p.icon.kind === 'IconData')) I.cerr(`Icon() expects IconData such as Icons.star, got '${typeName(p.icon)}'.`);
  if ((full === 'Container' || full === 'AnimatedContainer') && p.color && p.decoration) I.throwDart('AssertionError', "Cannot provide both a color and a decoration\nTo provide both, use \"decoration: BoxDecoration(color: color)\".");
  if ((full === 'Switch' || full === 'Checkbox' || full.endsWith('ListTile') && 'value' in p) && 'value' in p && typeof p.value !== 'boolean' && !(full === 'Checkbox' && p.value === null)) I.cerr(`'value' of '${full}' must be a bool.`);
  if (full === 'Slider') { const v = numVal(p.value), lo = numVal(p.min ?? new DDouble(0)), hi = numVal(p.max ?? new DDouble(1)); if (v < lo || v > hi) I.throwDart('AssertionError', `Slider value ${v} is not between min ${lo} and max ${hi}`); }
  if (full === 'Expanded' || full === 'Flexible') { if (p.flex !== undefined && (typeof p.flex !== 'number' || p.flex < 0)) I.cerr("'flex' must be a non-negative int."); }
  if (full === 'Opacity' || full === 'AnimatedOpacity') { const o = numVal(p.opacity); if (o < 0 || o > 1) I.throwDart('AssertionError', 'opacity must be between 0.0 and 1.0'); }
  for (const cb of ['onPressed', 'onTap', 'onChanged', 'onLongPress', 'onSubmitted', 'validator', 'itemBuilder', 'builder', 'onDoubleTap', 'separatorBuilder']) {
    const v = p[cb];
    if (v !== undefined && v !== null && !(v instanceof Closure || v instanceof NativeFn)) I.cerr(`'${cb}' of '${full}' must be a function (e.g. () { ... }), but got '${typeName(v)}'. Did you call the function instead of passing it?`);
  }
}

// ---------------- Resolver ----------------
export interface RNode { id: string; type: string; props: Record<string, any>; slots: Record<string, RNode | RNode[] | null>; src: any; userClass?: string; ctor?: string }

export interface PreviewEnv { width: number; height: number; dark?: boolean }

export function resolveRoot(I: Interpreter, env: PreviewEnv): RNode | null {
  if (!I.rootWidget) return null;
  const seen = new Set<string>();
  const ctx = new NObj('BuildContext', { theme: I.hooks.defaultTheme, size: new NObj('Size', { width: new DDouble(env.width), height: new DDouble(env.height) }), mounted: true, route: null });
  I.hooks.forms = new Map();
  const envKey = `${env.width}x${env.height}`;
  if (I.hooks.lastEnv !== envKey) { I.hooks.buildCache = new Map(); I.hooks.lastEnv = envKey; } // inherited MediaQuery changed → rebuild all
  I.resetBudget();
  const root = resolve(I, I.rootWidget, 'r', ctx, seen, null);
  // dispose states removed from the tree
  for (const [k, st] of [...I.states.entries()]) {
    if (!seen.has(k)) {
      I.states.delete(k);
      I.hooks.buildCache?.delete(k);
      st.fields.set('mounted', false);
      const m = I.findMethod(st.cls, 'dispose');
      if (m) I.callValue(I.getMember(st, 'dispose'), []);
    }
  }
  I.dirty = false;
  return root;
}

function keyOf(v: any): string | null {
  const k = v instanceof NObj ? v.props.key : v instanceof DInstance ? v.fields.get('key') : null;
  return k instanceof NObj ? k.props.k : null;
}

function resolve(I: Interpreter, v: any, path: string, ctx: NObj, seen: Set<string>, form: NObj | null): RNode | null {
  if (v === null || v === undefined) return null;
  if (v instanceof DInstance && v.cls.isSubOf('StatelessWidget')) {
    const c2 = new NObj('BuildContext', { ...ctx.props });
    const out = I.callValue(I.getMember(v, 'build'), [c2]);
    if (!isWidgetLike(I, out)) throw new EngineError(`${v.cls.name}.build() must return a Widget, but returned '${typeName(out)}'.`, 0, 0, 'compile');
    const r = resolve(I, out, path + '/' + v.cls.name, ctx, seen, form);
    if (r) r.userClass = r.userClass ? v.cls.name + ' › ' + r.userClass : v.cls.name;
    return r;
  }
  if (v instanceof DInstance && v.cls.isSubOf('StatefulWidget')) {
    const sk = path + '/' + v.cls.name;
    let st = I.states.get(sk);
    let fresh = false;
    if (!st) {
      fresh = true;
      st = I.callValue(I.getMember(v, 'createState'), []);
      if (!(st instanceof DInstance) || !st.cls.isSubOf('State')) throw new EngineError(`${v.cls.name}.createState() must return a State object.`, 0, 0, 'compile');
      st.fields.set('widget', v);
      st.fields.set('context', ctx);
      st.fields.set('mounted', true);
      I.states.set(sk, st);
      I.callValue(I.getMember(st, 'initState'), []);
    } else if (st.fields.get('widget') !== v) {
      const old = st.fields.get('widget');
      st.fields.set('widget', v);
      I.callValue(I.getMember(st, 'didUpdateWidget'), [old]);
    }
    seen.add(sk);
    const cache: Map<string, { widget: any; out: any }> = (I.hooks.buildCache ??= new Map());
    const dirty: Set<any> | undefined = I.hooks.dirtyStates;
    const hit = cache.get(sk);
    let out: any;
    if (!fresh && hit && hit.widget === v && !dirty?.has(st)) {
      out = hit.out; // not dirty and same configuration: Flutter would not call build() again
    } else {
      const c2 = new NObj('BuildContext', { ...ctx.props });
      st.fields.set('context', c2);
      out = I.callValue(I.getMember(st, 'build'), [c2]);
      if (!isWidgetLike(I, out)) throw new EngineError(`${st.cls.name}.build() must return a Widget, but returned '${typeName(out)}'.`, 0, 0, 'compile');
      cache.set(sk, { widget: v, out });
      dirty?.delete(st);
    }
    const r = resolve(I, out, sk, ctx, seen, form);
    if (r) r.userClass = r.userClass ? v.cls.name + ' › ' + r.userClass : v.cls.name;
    return r;
  }
  if (!(v instanceof NObj) || !v.isWidget) throw new EngineError(`Expected a Widget in the tree but found '${typeName(v)}'.`, 0, 0, 'compile');
  const p = v.props;
  const node: RNode = { id: path, type: v.kind, props: p, slots: {}, src: v, ctor: v.ctor };
  const sub = (val: any, name: string, c = ctx, f = form) => resolve(I, val, path + '/' + name, c, seen, f);
  const list = (arr: any[], name: string, c = ctx, f = form) => arr.map((x, i) => { const k = keyOf(x); return resolve(I, x, path + '/' + name + (k ? '[' + k + ']' : i), c, seen, f); }).filter(Boolean) as RNode[];
  switch (v.kind) {
    case 'MaterialApp': {
      const th = p.themeMode?.name === 'dark' && p.darkTheme ? p.darkTheme : p.theme ?? I.hooks.defaultTheme;
      const c2 = new NObj('BuildContext', { ...ctx.props, theme: th });
      I.namedRoutes = p.routes instanceof Map ? p.routes : null;
      let base: any = null;
      if (p.home) base = p.home;
      else if (p.initialRoute && I.namedRoutes?.get(p.initialRoute)) base = I.callValue(I.namedRoutes.get(p.initialRoute), [c2]);
      else if (I.namedRoutes?.get('/')) base = I.callValue(I.namedRoutes.get('/'), [c2]);
      // Every route in the stack stays mounted (like Flutter's Navigator); only the top one is shown.
      const pages: RNode[] = [];
      const n0 = I.routeStack.length;
      pages.push(resolve(I, base, path + '/route0', new NObj('BuildContext', { ...c2.props, route: null, canPop: false }), seen, form) as RNode);
      I.routeStack.forEach((r: any, i: number) => {
        const c3 = new NObj('BuildContext', { ...c2.props, route: r.props.settings, canPop: true });
        pages.push(resolve(I, I.callValue(r.props.builder, [c3]), path + '/route' + (i + 1), c3, seen, form) as RNode);
      });
      const c4 = new NObj('BuildContext', { ...c2.props, route: I.routeStack[n0 - 1]?.props.settings ?? null, canPop: n0 > 0 });
      node.props = { ...p, __theme: th, __canPop: n0 > 0, __below: pages.slice(0, -1) };
      node.slots.home = pages[pages.length - 1] ?? null;
      const dl = I.hooks.dialogs?.[I.hooks.dialogs.length - 1];
      if (dl) node.slots.dialog = resolve(I, I.callValue(dl, [c4]), path + '/dialog', c4, seen, form);
      if (I.hooks.snack) node.slots.snack = resolve(I, I.hooks.snack.props.content, path + '/snack', c4, seen, form);
      return node;
    }
    case 'Builder': return sub(I.callValue(p.builder, [new NObj('BuildContext', { ...ctx.props })]), 'b');
    case 'LayoutBuilder': {
      const sz = ctx.props.size.props;
      return sub(I.callValue(p.builder, [new NObj('BuildContext', { ...ctx.props }), new NObj('BoxConstraints', { maxWidth: sz.width, maxHeight: sz.height, minWidth: new DDouble(0), minHeight: new DDouble(0) })]), 'b');
    }
    case 'ListView':
      if (v.ctor === 'builder' || v.ctor === 'separated') {
        const n = Math.min(typeof p.itemCount === 'number' ? p.itemCount : 30, 200);
        const items: any[] = [];
        for (let i = 0; i < n; i++) {
          items.push(I.callValue(p.itemBuilder, [new NObj('BuildContext', { ...ctx.props }), i]));
          if (v.ctor === 'separated' && i < n - 1) items.push(I.callValue(p.separatorBuilder, [new NObj('BuildContext', { ...ctx.props }), i]));
        }
        node.slots.children = list(items, 'c');
        return node;
      }
      break;
    case 'Form': {
      const key = p.key instanceof NObj && p.key.kind === 'GlobalKey' ? p.key : null;
      if (key) key.props.__fields = [];
      node.slots.child = sub(p.child, 'child', ctx, key);
      return node;
    }
    case 'TextFormField': {
      if (form) {
        const id = path;
        const store = (I.hooks.fieldText ??= new Map<string, string>());
        const errs = (I.hooks.fieldErr ??= new Map<string, any>());
        if (!store.has(id)) store.set(id, p.controller?.props?.text ?? p.initialValue ?? '');
        form.props.__fields.push({
          validator: p.validator, onSaved: p.onSaved,
          getText: () => (p.controller ? p.controller.props.text : store.get(id)),
          setText: (t: string) => { if (p.controller) p.controller.props.text = t; store.set(id, t); },
          setError: (e: any) => errs.set(id, e),
        });
      }
      return node;
    }
  }
  for (const [k, val] of Object.entries(p)) {
    if (k === 'key') continue;
    if (isWidgetLike(I, val)) node.slots[k] = sub(val, k);
    else if (Array.isArray(val) && val.length && val.every((x) => isWidgetLike(I, x))) node.slots[k] = list(val, k);
    else if (k === 'items' && Array.isArray(val)) node.slots[k] = val.map((x: any, i: number) => (x instanceof NObj ? { id: path + '/items' + i, type: x.kind, props: x.props, slots: { child: x.props.child ? sub(x.props.child, 'items' + i) : null, icon: x.props.icon ? sub(x.props.icon, 'itemicon' + i) : null }, src: x } : null)).filter(Boolean) as RNode[];
  }
  return node;
}

/** Invoke a callback from the preview/harness safely, returning an error message or null. */
export function fire(I: Interpreter, fn: any, args: any[]): void {
  if (!fn) return;
  I.resetBudget();
  I.callValue(fn, args);
}

export function walk(n: RNode | null, f: (n: RNode, depth: number) => void, depth = 0) {
  if (!n) return;
  f(n, depth);
  for (const s of Object.values(n.slots)) {
    if (Array.isArray(s)) s.forEach((c) => walk(c, f, depth + 1));
    else if (s) walk(s, f, depth + 1);
  }
}
export function textOf(n: RNode | null): string {
  const out: string[] = [];
  walk(n, (x) => { if (x.type === 'Text') out.push(x.props.data); });
  return out.join(' ');
}
export { DClass };
