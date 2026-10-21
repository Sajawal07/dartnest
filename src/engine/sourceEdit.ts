// Inspector ⇄ source synchronisation. Uses AST source ranges (never regex) to rewrite
// literal arguments of the widget constructor call that produced the selected widget.
import type { Node } from './parser';
import { NObj, toStr, numVal, isNum, DEnumValue } from './values';

export type PropKind = 'number' | 'edgeAll' | 'color' | 'alignment' | 'mainAxis' | 'crossAxis' | 'text' | 'radius' | 'fontWeight' | 'borderWidth';
export interface PropSpec { key: string; label: string; kind: PropKind; path?: 'decoration' | 'style'; min?: number; max?: number; step?: number; positional?: number }

const N = (key: string, label: string, min = 0, max = 400, step = 1): PropSpec => ({ key, label, kind: 'number', min, max, step });
const COLOR = (key = 'color', label = 'Colour', path?: PropSpec['path']): PropSpec => ({ key, label, kind: 'color', path });
export const INSPECTABLE: Record<string, PropSpec[]> = {
  Container: [N('width', 'Width'), N('height', 'Height'), { key: 'padding', label: 'Padding (all)', kind: 'edgeAll', min: 0, max: 64 }, { key: 'margin', label: 'Margin (all)', kind: 'edgeAll', min: 0, max: 64 }, COLOR('color', 'Background colour'), { key: 'borderRadius', label: 'Border radius', kind: 'radius', path: 'decoration', min: 0, max: 100 }, { key: 'border', label: 'Border width', kind: 'borderWidth', path: 'decoration', min: 0, max: 12 }, { key: 'alignment', label: 'Child alignment', kind: 'alignment' }],
  AnimatedContainer: [N('width', 'Width'), N('height', 'Height'), COLOR('color', 'Background colour'), { key: 'alignment', label: 'Child alignment', kind: 'alignment' }],
  SizedBox: [N('width', 'Width'), N('height', 'Height')],
  Padding: [{ key: 'padding', label: 'Padding (all)', kind: 'edgeAll', min: 0, max: 64 }],
  Align: [{ key: 'alignment', label: 'Alignment', kind: 'alignment' }],
  Text: [{ key: 'data', label: 'Text', kind: 'text', positional: 0 }, { key: 'fontSize', label: 'Font size', kind: 'number', path: 'style', min: 8, max: 64 }, { key: 'fontWeight', label: 'Font weight', kind: 'fontWeight', path: 'style' }, COLOR('color', 'Text colour', 'style')],
  Icon: [N('size', 'Icon size', 8, 96), COLOR()],
  Row: [{ key: 'mainAxisAlignment', label: 'Main-axis alignment', kind: 'mainAxis' }, { key: 'crossAxisAlignment', label: 'Cross-axis alignment', kind: 'crossAxis' }, N('spacing', 'Spacing', 0, 48)],
  Column: [{ key: 'mainAxisAlignment', label: 'Main-axis alignment', kind: 'mainAxis' }, { key: 'crossAxisAlignment', label: 'Cross-axis alignment', kind: 'crossAxis' }, N('spacing', 'Spacing', 0, 48)],
  Expanded: [N('flex', 'Flex', 1, 10)], Flexible: [N('flex', 'Flex', 1, 10)], Spacer: [N('flex', 'Flex', 1, 10)],
  Card: [COLOR(), N('elevation', 'Elevation', 0, 24), { key: 'margin', label: 'Margin (all)', kind: 'edgeAll', min: 0, max: 48 }],
  Divider: [N('height', 'Height', 0, 64), N('thickness', 'Thickness', 0, 12), COLOR()],
  CircleAvatar: [N('radius', 'Radius', 8, 96), COLOR('backgroundColor', 'Background colour')],
  Opacity: [{ key: 'opacity', label: 'Opacity', kind: 'number', min: 0, max: 1, step: 0.05 }],
  ListTile: [COLOR('tileColor', 'Tile colour')],
};
export const COLOR_CHOICES = ['red', 'pink', 'purple', 'deepPurple', 'indigo', 'blue', 'lightBlue', 'cyan', 'teal', 'green', 'lightGreen', 'lime', 'yellow', 'amber', 'orange', 'deepOrange', 'brown', 'grey', 'blueGrey', 'black', 'white', 'transparent'];
export const ALIGN_CHOICES = ['topLeft', 'topCenter', 'topRight', 'centerLeft', 'center', 'centerRight', 'bottomLeft', 'bottomCenter', 'bottomRight'];
export const MAIN_CHOICES = ['start', 'center', 'end', 'spaceBetween', 'spaceAround', 'spaceEvenly'];
export const CROSS_CHOICES = ['start', 'center', 'end', 'stretch'];
export const WEIGHT_CHOICES = ['normal', 'w300', 'w500', 'w600', 'bold', 'w900'];

interface Edit { s: number; e: number; text: string }
export interface EditResult { ok: true; code: string; summary: string } 
export interface EditError { ok: false; reason: string }

const unwrap = (n: Node): Node => (n && (n.k === 'constExpr' || n.k === 'paren') ? unwrap(n.e) : n);
export function startOff(n: Node): number { if (!n) return 0; if (n.k === 'member' || n.k === 'nullMember') return startOff(n.obj); if (n.k === 'call') return startOff(n.fn); if (n.k === 'index') return startOff(n.obj); return n.off ?? 0; }
const calleeName = (call: Node): string => { const f = call?.fn; if (!f) return ''; if (f.k === 'id') return f.name; if (f.k === 'member' && f.obj.k === 'id') return `${f.obj.name}.${f.name}`; return ''; };
const named = (call: Node, key: string) => { const i = (call.named as [string, Node][]).findIndex(([k]) => k === key); return i < 0 ? null : { node: unwrap(call.named[i][1]), pos: call.namedPos[i] as { name: string; nameOff: number; s: number; e: number } }; };
function insertNamed(call: Node, key: string, value: string): Edit {
  const ends = [...call.argPos.map((p: any) => p.e), ...call.namedPos.map((p: any) => p.e)];
  if (!ends.length) return { s: call.aStart + 1, e: call.aStart + 1, text: `${key}: ${value}` };
  const last = Math.max(...ends);
  return { s: last, e: last, text: `, ${key}: ${value}` };
}
function apply(code: string, edits: Edit[]) { return [...edits].sort((a, b) => b.s - a.s).reduce((c, ed) => c.slice(0, ed.s) + ed.text + c.slice(ed.e), code); }
const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));
export const dartString = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$').replace(/\n/g, '\\n')}'`;

/** Is the existing argument expression something the inspector can safely rewrite? */
function editableValue(kind: PropKind, n: Node): boolean {
  if (!n) return true;
  switch (kind) {
    case 'number': case 'borderWidth': return n.k === 'num' || (n.k === 'neg' && n.e.k === 'num') || (kind === 'borderWidth' && n.k === 'call' && calleeName(n) === 'Border.all');
    case 'edgeAll': return n.k === 'call' && calleeName(n).startsWith('EdgeInsets.');
    case 'radius': return n.k === 'call' && calleeName(n).startsWith('BorderRadius.');
    case 'color': return (n.k === 'member' && (n.obj.k === 'id' && n.obj.name === 'Colors' || (n.obj.k === 'member' && n.obj.obj.k === 'id' && n.obj.obj.name === 'Colors'))) || (n.k === 'call' && calleeName(n).startsWith('Color'));
    case 'alignment': return n.k === 'member' && n.obj.k === 'id' && n.obj.name === 'Alignment';
    case 'mainAxis': return n.k === 'member' && n.obj.k === 'id' && n.obj.name === 'MainAxisAlignment';
    case 'crossAxis': return n.k === 'member' && n.obj.k === 'id' && n.obj.name === 'CrossAxisAlignment';
    case 'fontWeight': return n.k === 'member' && n.obj.k === 'id' && n.obj.name === 'FontWeight';
    case 'text': return n.k === 'str';
  }
}
export function valueText(kind: PropKind, v: any): string {
  switch (kind) {
    case 'number': return fmtNum(Number(v));
    case 'edgeAll': return `EdgeInsets.all(${fmtNum(Number(v))})`;
    case 'radius': return `BorderRadius.circular(${fmtNum(Number(v))})`;
    case 'borderWidth': return `Border.all(width: ${fmtNum(Number(v))})`;
    case 'color': return `Colors.${v}`;
    case 'alignment': return `Alignment.${v}`;
    case 'mainAxis': return `MainAxisAlignment.${v}`;
    case 'crossAxis': return `CrossAxisAlignment.${v}`;
    case 'fontWeight': return `FontWeight.${v}`;
    case 'text': return dartString(String(v));
  }
}

/** Status of a property for the inspector: editable, read-only (with reason) or absent. */
export function propStatus(call: Node | null, spec: PropSpec): { editable: boolean; reason?: string; present: boolean } {
  if (!call || call.k !== 'call' || !call.namedPos) return { editable: false, reason: 'No source call found for this widget.', present: false };
  if (spec.positional !== undefined) {
    const a = unwrap(call.args[spec.positional]);
    if (!a) return { editable: false, reason: 'Missing positional argument.', present: false };
    return editableValue(spec.kind, a) ? { editable: true, present: true } : { editable: false, reason: a.k === 'interp' ? 'Text uses string interpolation — edit it in code.' : 'Text comes from an expression — edit it in code.', present: true };
  }
  let target = call;
  if (spec.path) {
    const p = named(call, spec.path);
    if (p) {
      if (p.node.k !== 'call' || calleeName(p.node) !== (spec.path === 'decoration' ? 'BoxDecoration' : 'TextStyle')) return { editable: false, reason: `'${spec.path}' is not a literal ${spec.path === 'decoration' ? 'BoxDecoration(...)' : 'TextStyle(...)'} — edit it in code.`, present: true };
      target = p.node;
    } else return { editable: true, present: false };
  }
  // Container colour lives inside the decoration when one exists
  if (spec.kind === 'color' && !spec.path && calleeName(call) === 'Container' && named(call, 'decoration')) {
    const d = named(call, 'decoration')!;
    if (d.node.k !== 'call' || calleeName(d.node) !== 'BoxDecoration') return { editable: false, reason: 'Colour is set by a non-literal decoration — edit it in code.', present: true };
    target = d.node;
  }
  const a = named(target, spec.key);
  if (!a) return { editable: true, present: false };
  return editableValue(spec.kind, a.node) ? { editable: true, present: true } : { editable: false, reason: `'${spec.key}' is computed by an expression — edit it in code (two-way sync only supports literal values).`, present: true };
}

export function applyProp(code: string, call: Node, spec: PropSpec, value: any): EditResult | EditError {
  const st = propStatus(call, spec);
  if (!st.editable) return { ok: false, reason: st.reason ?? 'Not editable.' };
  const text = valueText(spec.kind, value);
  const edits: Edit[] = [];
  const isContainer = calleeName(call) === 'Container' || calleeName(call) === 'AnimatedContainer';
  if (spec.positional !== undefined) {
    const p = call.argPos[spec.positional];
    edits.push({ s: p.s, e: p.e, text });
  } else if (spec.path || (spec.kind === 'color' && isContainer && named(call, 'decoration'))) {
    const path = spec.path ?? 'decoration';
    const holder = named(call, path);
    if (holder) {
      const a = named(holder.node, spec.key);
      edits.push(a ? { s: a.pos.s, e: a.pos.e, text } : insertNamed(holder.node, spec.key, text));
    } else {
      const ctor = path === 'decoration' ? 'BoxDecoration' : 'TextStyle';
      const col = path === 'decoration' ? named(call, 'color') : null;
      if (col) {
        // Container asserts color + decoration can't coexist: move the colour into the new decoration.
        const colText = code.slice(col.pos.s, col.pos.e);
        edits.push({ s: col.pos.nameOff, e: col.pos.e, text: `decoration: ${ctor}(color: ${colText}, ${spec.key}: ${text})` });
      } else edits.push(insertNamed(call, path, `${ctor}(${spec.key}: ${text})`));
    }
  } else {
    const a = named(call, spec.key);
    edits.push(a ? { s: a.pos.s, e: a.pos.e, text } : insertNamed(call, spec.key, text));
  }
  return { ok: true, code: apply(code, edits), summary: `${calleeName(call)}.${spec.path ? spec.path + '.' : ''}${spec.key} → ${text}` };
}

/** Current runtime value of a property, normalised for the inspector controls. */
export function currentValue(props: Record<string, any>, spec: PropSpec, widget: string): any {
  let v: any = spec.positional !== undefined ? props.data : undefined;
  if (spec.positional === undefined) {
    const holder = spec.path ? props[spec.path]?.props : (spec.kind === 'color' && widget.includes('Container') && props.decoration ? props.decoration.props : null);
    v = holder ? holder[spec.key] : props[spec.key];
  }
  if (v === undefined || v === null) return undefined;
  switch (spec.kind) {
    case 'number': return isNum(v) ? numVal(v) : undefined;
    case 'edgeAll': return v instanceof NObj ? v.props.left : undefined;
    case 'radius': return v instanceof NObj ? v.props.r : undefined;
    case 'borderWidth': return v instanceof NObj ? v.props.width : undefined;
    case 'color': return v instanceof NObj ? colorName(v) : undefined;
    case 'alignment': return v instanceof NObj ? v.props.name : undefined;
    case 'mainAxis': case 'crossAxis': return v instanceof DEnumValue ? v.name : undefined;
    case 'fontWeight': return v instanceof NObj ? ({ 400: 'normal', 700: 'bold' } as any)[v.props.weight] ?? `w${v.props.weight}` : undefined;
    case 'text': return typeof v === 'string' ? v : toStr(v);
  }
}
const COLOR_VALUES: Record<string, number> = {};
export function registerColor(name: string, value: number) { COLOR_VALUES[name] = value >>> 0; }
function colorName(c: NObj): string { const v = c.props.value >>> 0; return Object.keys(COLOR_VALUES).find((k) => COLOR_VALUES[k] === v) ?? `0x${v.toString(16)}`; }
export function sourceOf(code: string, call: Node): { text: string; line: number } {
  const s = startOff(call);
  return { text: code.slice(s, (call.aEnd ?? s) + 1), line: call.line ?? 1 };
}
