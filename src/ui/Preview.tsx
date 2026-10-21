import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react';
import type { RNode } from '../engine/flutter';
import { argb, ICONS } from '../engine/flutter';
import { NObj, DDouble, DEnumValue, numVal, isNum, toStr, Closure, NativeFn } from '../engine/values';
import type { Interpreter } from '../engine/runtime';

export interface PreviewApi { interp: Interpreter; fire: (fn: any, args: any[]) => void; inspect: boolean; selected: string | null; select: (n: RNode) => void; reducedMotion: boolean }
const Ctx = createContext<PreviewApi | null>(null);
const Bounded = createContext(true);
const ThemeCtx = createContext<Record<string, string>>({});
const NavCtx = createContext<{ canPop: boolean }>({ canPop: false });

const px = (v: any): string | undefined => { if (v === undefined || v === null || !isNum(v)) return undefined; const n = numVal(v); return Number.isFinite(n) ? `${n}px` : '100%'; };
const ei = (e: any): string | undefined => (e instanceof NObj && e.kind === 'EdgeInsets' ? `${e.props.top}px ${e.props.right}px ${e.props.bottom}px ${e.props.left}px` : undefined);
const col = (c: any) => argb(c);
const MAIN: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', spaceBetween: 'space-between', spaceAround: 'space-around', spaceEvenly: 'space-evenly' };
const CROSS: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch', baseline: 'baseline' };
const ALIGN: Record<string, [string, string]> = { topLeft: ['flex-start', 'flex-start'], topCenter: ['center', 'flex-start'], topRight: ['flex-end', 'flex-start'], centerLeft: ['flex-start', 'center'], center: ['center', 'center'], centerRight: ['flex-end', 'center'], bottomLeft: ['flex-start', 'flex-end'], bottomCenter: ['center', 'flex-end'], bottomRight: ['flex-end', 'flex-end'] };
const en = (v: any) => (v instanceof DEnumValue ? v.name : undefined);

function textStyle(s: any, t: Record<string, string>): CSSProperties {
  const p = s instanceof NObj ? s.props : {};
  return {
    fontSize: px(p.fontSize) ?? '14px', fontWeight: p.fontWeight?.props?.weight, color: col(p.color) ?? t.onSurface,
    fontStyle: en(p.fontStyle) === 'italic' ? 'italic' : undefined, letterSpacing: px(p.letterSpacing),
    textDecoration: en(p.decoration) === 'underline' ? 'underline' : en(p.decoration) === 'lineThrough' ? 'line-through' : undefined,
    lineHeight: p.height ? String(numVal(p.height)) : undefined, backgroundColor: col(p.backgroundColor),
  };
}
function decoration(d: any): CSSProperties {
  if (!(d instanceof NObj) || d.kind !== 'BoxDecoration') return {};
  const p = d.props; const s: CSSProperties = {};
  if (p.color) s.background = col(p.color);
  if (p.borderRadius) s.borderRadius = `${p.borderRadius.props.r}px`;
  if (en(p.shape) === 'circle') s.borderRadius = '9999px';
  if (p.border) s.border = `${p.border.props.width}px solid ${col(p.border.props.color)}`;
  if (p.gradient && Array.isArray(p.gradient.props.colors)) s.background = `linear-gradient(135deg, ${p.gradient.props.colors.map(col).join(', ')})`;
  if (Array.isArray(p.boxShadow)) s.boxShadow = p.boxShadow.map((b: NObj) => `${b.props.offset?.props.dx ?? 0}px ${b.props.offset?.props.dy ?? 2}px ${numVal(b.props.blurRadius ?? 4)}px ${col(b.props.color) ?? 'rgba(0,0,0,.25)'}`).join(', ');
  return s;
}
const slot = (n: RNode, k: string) => n.slots[k] as RNode | null | undefined;
const slots = (n: RNode, k: string) => (Array.isArray(n.slots[k]) ? (n.slots[k] as RNode[]) : []);

function Kid({ n, bounded }: { n: RNode | null | undefined; bounded?: boolean }) {
  if (!n) return null;
  return bounded === undefined ? <W n={n} /> : <Bounded.Provider value={bounded}><W n={n} /></Bounded.Provider>;
}

function Frame({ n, children, style, tag }: { n: RNode; children?: ReactNode; style?: CSSProperties; tag?: 'button' | 'div' }) {
  const api = useContext(Ctx)!;
  const sel = api.inspect && api.selected === n.id;
  const onClick = api.inspect ? (e: any) => { e.stopPropagation(); e.preventDefault(); api.select(n); } : undefined;
  const Tag: any = tag ?? 'div';
  return <Tag data-w={n.type} onClickCapture={onClick} style={{ ...style, outline: sel ? '2px solid #f59e0b' : api.inspect ? '1px dashed rgba(99,102,241,.35)' : undefined, outlineOffset: -1 }}>{children}</Tag>;
}

function W({ n }: { n: RNode }): ReactNode {
  const api = useContext(Ctx)!;
  const t = useContext(ThemeCtx);
  const bounded = useContext(Bounded);
  const nav = useContext(NavCtx);
  const p = n.props;
  const fire = (fn: any, args: any[] = []) => { if (!api.inspect && (fn instanceof Closure || fn instanceof NativeFn)) api.fire(fn, args); };
  const motion = api.reducedMotion ? undefined : `all ${p.duration?.props?.ms ?? 0}ms ease-in-out`;
  switch (n.type) {
    case 'MaterialApp': {
      const th = p.__theme?.props?.colorScheme?.props ?? {};
      const theme: Record<string, string> = { primary: col(th.primary) ?? '#6750a4', onPrimary: col(th.onPrimary) ?? '#fff', primaryContainer: col(th.primaryContainer) ?? '#eaddff', surface: col(th.surface) ?? '#fffbfe', onSurface: col(th.onSurface) ?? '#1c1b1f', secondary: col(th.secondary) ?? '#625b71', error: col(th.error) ?? '#b3261e', dark: en(th.brightness) === 'dark' ? '1' : '' };
      return <ThemeCtx.Provider value={theme}><NavCtx.Provider value={{ canPop: !!p.__canPop }}>
        <Frame n={n} style={{ position: 'relative', height: '100%', background: theme.surface, color: theme.onSurface, fontFamily: 'Roboto, system-ui, sans-serif', overflow: 'hidden' }}>
          <Kid n={slot(n, 'home')} bounded />
          {slot(n, 'snack') && <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, background: '#313033', color: '#f4eff4', borderRadius: 4, padding: '14px 16px', fontSize: 14, boxShadow: '0 3px 8px rgba(0,0,0,.3)' }}><Kid n={slot(n, 'snack')} /></div>}
          {slot(n, 'dialog') && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', padding: 24 }}><Kid n={slot(n, 'dialog')} /></div>}
        </Frame></NavCtx.Provider></ThemeCtx.Provider>;
    }
    case 'Scaffold':
      return <Frame n={n} style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', background: col(p.backgroundColor) ?? t.surface }}>
        <Kid n={slot(n, 'appBar')} />
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative', display: 'flex', flexDirection: 'column' }}><Kid n={slot(n, 'body')} bounded /></div>
        {slot(n, 'bottomNavigationBar') && <Kid n={slot(n, 'bottomNavigationBar')} />}
        {slot(n, 'floatingActionButton') && <div style={{ position: 'absolute', right: 16, bottom: slot(n, 'bottomNavigationBar') ? 96 : 16 }}><Kid n={slot(n, 'floatingActionButton')} /></div>}
      </Frame>;
    case 'AppBar': {
      const back = nav.canPop && !slot(n, 'leading') && p.automaticallyImplyLeading !== false;
      return <Frame n={n} style={{ height: 64, minHeight: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px 0 4px', background: col(p.backgroundColor) ?? t.surface, color: col(p.foregroundColor) ?? t.onSurface, boxShadow: '0 1px 0 rgba(0,0,0,.06)' }}>
        {back && <button aria-label="Back" onClick={() => { if (api.inspect) return; api.interp.routeStack.pop(); api.interp.dirty = true; api.fire(null, []); }} style={{ width: 40, height: 40, borderRadius: 20, fontSize: 20 }}>←</button>}
        {slot(n, 'leading') && <Kid n={slot(n, 'leading')} />}
        <div style={{ flex: 1, fontSize: 22, paddingLeft: back || slot(n, 'leading') ? 0 : 12, textAlign: p.centerTitle ? 'center' : 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><Kid n={slot(n, 'title')} /></div>
        <div style={{ display: 'flex' }}>{slots(n, 'actions').map((c) => <Kid key={c.id} n={c} />)}</div>
      </Frame>;
    }
    case 'Text': {
      const st = textStyle(p.style, t);
      const clamp = typeof p.maxLines === 'number';
      return <Frame n={n} style={{ ...st, textAlign: (en(p.textAlign) as any) ?? undefined, whiteSpace: 'pre-wrap', ...(clamp ? { display: '-webkit-box', WebkitLineClamp: p.maxLines, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' } : {}) }}>{p.data}</Frame>;
    }
    case 'Icon': {
      const name = p.icon?.props?.name;
      return <Frame n={n} style={{ fontSize: px(p.size) ?? '24px', width: px(p.size) ?? '24px', height: px(p.size) ?? '24px', lineHeight: 1, display: 'inline-grid', placeItems: 'center', color: col(p.color) ?? 'inherit', flexShrink: 0 }}><span aria-label={p.semanticLabel ?? name} role="img">{ICONS[name] ?? '?'}</span></Frame>;
    }
    case 'Container': case 'AnimatedContainer': {
      const al = p.alignment?.props?.name;
      const st: CSSProperties = { width: px(p.width), height: px(p.height), padding: ei(p.padding), margin: ei(p.margin), background: col(p.color), ...decoration(p.decoration), boxSizing: 'border-box', transition: n.type === 'AnimatedContainer' ? motion : undefined, flexShrink: 0 };
      if (p.constraints instanceof NObj) { st.maxWidth = px(p.constraints.props.maxWidth); st.minHeight = px(p.constraints.props.minHeight); st.maxHeight = px(p.constraints.props.maxHeight); st.minWidth = px(p.constraints.props.minWidth); }
      if (al && ALIGN[al]) Object.assign(st, { display: 'flex', justifyContent: ALIGN[al][0], alignItems: ALIGN[al][1] });
      return <Frame n={n} style={st}><Kid n={slot(n, 'child')} bounded={p.height !== undefined} /></Frame>;
    }
    case 'Padding': return <Frame n={n} style={{ padding: ei(p.padding), boxSizing: 'border-box' }}><Kid n={slot(n, 'child')} /></Frame>;
    case 'SizedBox': return <Frame n={n} style={{ width: n.ctor === 'expand' ? '100%' : px(p.width), height: n.ctor === 'expand' ? '100%' : px(p.height), flexShrink: 0, display: slot(n, 'child') ? 'flex' : undefined, flexDirection: 'column' }}><Kid n={slot(n, 'child')} bounded={p.height !== undefined} /></Frame>;
    case 'Center': return <Frame n={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: bounded ? '100%' : undefined, flex: bounded ? 1 : undefined }}><Kid n={slot(n, 'child')} bounded={false} /></Frame>;
    case 'Align': { const a = ALIGN[p.alignment?.props?.name] ?? ALIGN.center; return <Frame n={n} style={{ display: 'flex', justifyContent: a[0], alignItems: a[1], width: '100%', height: bounded ? '100%' : undefined }}><Kid n={slot(n, 'child')} bounded={false} /></Frame>; }
    case 'Row': case 'Column': {
      const isRow = n.type === 'Row';
      const main = MAIN[en(p.mainAxisAlignment) ?? 'start'];
      const cross = CROSS[en(p.crossAxisAlignment) ?? 'center'];
      const fill = en(p.mainAxisSize) !== 'min';
      const st: CSSProperties = { display: 'flex', flexDirection: isRow ? 'row' : 'column', justifyContent: main, alignItems: cross, gap: px(p.spacing), minWidth: 0, minHeight: 0 };
      if (isRow && fill) st.width = '100%';
      if (!isRow && fill && bounded) { st.height = '100%'; st.flex = 1; }
      if (!isRow) st.width = cross === 'stretch' ? '100%' : st.width;
      if (!isRow && cross !== 'center') st.width = '100%';
      return <Frame n={n} style={st}>{slots(n, 'children').map((c) => <Bounded.Provider key={c.id} value={!isRow && false}><W n={c} /></Bounded.Provider>)}</Frame>;
    }
    case 'Expanded': case 'Flexible': {
      const f = typeof p.flex === 'number' ? p.flex : 1;
      return <Frame n={n} style={n.type === 'Expanded' ? { flex: `${f} 1 0px`, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' } : { flex: `0 1 auto`, minWidth: 0 }}><Kid n={slot(n, 'child')} bounded /></Frame>;
    }
    case 'Spacer': return <Frame n={n} style={{ flex: `${typeof p.flex === 'number' ? p.flex : 1} 1 0px` }} />;
    case 'Stack':
      return <Frame n={n} style={{ position: 'relative', display: 'grid', justifyItems: 'start', alignItems: 'start' }}>{slots(n, 'children').map((c) => <div key={c.id} style={c.type === 'Positioned' ? { position: 'absolute', top: px(c.props.top), left: px(c.props.left), right: px(c.props.right), bottom: px(c.props.bottom), width: px(c.props.width), height: px(c.props.height) } : { gridArea: '1 / 1' }}><Kid n={c.type === 'Positioned' ? slot(c, 'child') : c} /></div>)}</Frame>;
    case 'Positioned': return <Kid n={slot(n, 'child')} />;
    case 'ListView': {
      const horiz = en(p.scrollDirection) === 'horizontal';
      return <Frame n={n} style={{ display: 'flex', flexDirection: horiz ? 'row' : 'column', overflow: 'auto', padding: ei(p.padding), flex: bounded && !p.shrinkWrap ? 1 : undefined, minHeight: 0, width: '100%' }}>{slots(n, 'children').map((c) => <Kid key={c.id} n={c} bounded={false} />)}</Frame>;
    }
    case 'GridView':
      return <Frame n={n} style={{ display: 'grid', gridTemplateColumns: `repeat(${p.crossAxisCount ?? 2}, minmax(0, 1fr))`, gap: `${px(p.mainAxisSpacing) ?? '0px'} ${px(p.crossAxisSpacing) ?? '0px'}`, padding: ei(p.padding), overflow: 'auto', width: '100%' }}>{slots(n, 'children').map((c) => <div key={c.id} style={{ aspectRatio: String(p.childAspectRatio ? numVal(p.childAspectRatio) : 1), display: 'flex', flexDirection: 'column', overflow: 'hidden' }}><Kid n={c} bounded /></div>)}</Frame>;
    case 'SingleChildScrollView': return <Frame n={n} style={{ overflow: 'auto', padding: ei(p.padding), flex: bounded ? 1 : undefined, minHeight: 0 }}><Kid n={slot(n, 'child')} bounded={false} /></Frame>;
    case 'Card': return <Frame n={n} style={{ background: col(p.color) ?? (t.dark ? '#2b2930' : '#f7f2fa'), borderRadius: 12, margin: ei(p.margin) ?? '4px', boxShadow: '0 1px 3px rgba(0,0,0,.18)', overflow: 'hidden' }}><Kid n={slot(n, 'child')} /></Frame>;
    case 'ListTile': case 'SwitchListTile': case 'CheckboxListTile': {
      const toggle = n.type !== 'ListTile';
      const onClick = toggle ? () => p.onChanged && fire(p.onChanged, [!p.value]) : p.onTap ? () => fire(p.onTap) : undefined;
      return <Frame n={n} style={{ width: '100%' }}><div role={onClick ? 'button' : undefined} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px', minHeight: 56, cursor: onClick ? 'pointer' : undefined, background: col(p.tileColor) }}>
        {slot(n, 'leading') && <Kid n={slot(n, 'leading')} />}
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 16 }}><Kid n={slot(n, 'title')} /></div>{slot(n, 'subtitle') && <div style={{ fontSize: 14, opacity: 0.7 }}><Kid n={slot(n, 'subtitle')} /></div>}</div>
        {slot(n, 'trailing') && <div onClick={(e) => e.stopPropagation()}><Kid n={slot(n, 'trailing')} /></div>}
        {n.type === 'SwitchListTile' && <SwitchVis on={!!p.value} t={t} />}
        {n.type === 'CheckboxListTile' && <CheckVis on={!!p.value} t={t} />}
      </div></Frame>;
    }
    case 'Divider': return <Frame n={n} style={{ height: px(p.height) ?? '16px', display: 'flex', alignItems: 'center', paddingLeft: px(p.indent), paddingRight: px(p.endIndent), width: '100%' }}><div style={{ flex: 1, borderTop: `${p.thickness ? numVal(p.thickness) : 1}px solid ${col(p.color) ?? 'rgba(121,116,126,.35)'}` }} /></Frame>;
    case 'ElevatedButton': case 'FilledButton': case 'OutlinedButton': case 'TextButton': {
      const disabled = !p.onPressed;
      const base: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, padding: '0 24px', borderRadius: 20, fontSize: 14, fontWeight: 500, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.38 : 1, whiteSpace: 'nowrap', margin: 2 };
      const v: Record<string, CSSProperties> = {
        ElevatedButton: { background: t.dark ? '#2b2930' : '#f7f2fa', color: t.primary, boxShadow: '0 1px 2px rgba(0,0,0,.3)' },
        FilledButton: { background: t.primary, color: t.onPrimary },
        OutlinedButton: { border: '1px solid #79747e', color: t.primary },
        TextButton: { color: t.primary, padding: '0 12px' },
      };
      return <Frame n={n} tag="div" style={{ display: 'inline-flex' }}><button disabled={disabled} onClick={() => fire(p.onPressed)} style={{ ...base, ...v[n.type] }}>
        {n.ctor === 'icon' ? <><Kid n={slot(n, 'icon')} /><Kid n={slot(n, 'label')} /></> : <Kid n={slot(n, 'child')} />}
      </button></Frame>;
    }
    case 'IconButton': return <Frame n={n} style={{ display: 'inline-flex' }}><button title={p.tooltip} aria-label={p.tooltip} disabled={!p.onPressed} onClick={() => fire(p.onPressed)} style={{ width: 40, height: 40, borderRadius: 20, display: 'grid', placeItems: 'center', opacity: p.onPressed ? 1 : 0.38, color: col(p.color) ?? 'inherit' }}><Kid n={slot(n, 'icon')} /></button></Frame>;
    case 'FloatingActionButton': return <Frame n={n}><button title={p.tooltip} aria-label={p.tooltip} onClick={() => fire(p.onPressed)} style={{ width: 56, height: 56, borderRadius: 16, background: col(p.backgroundColor) ?? t.primaryContainer, display: 'grid', placeItems: 'center', boxShadow: '0 3px 6px rgba(0,0,0,.25)', fontSize: 22 }}><Kid n={slot(n, 'child')} /></button></Frame>;
    case 'TextField': case 'TextFormField': return <FieldVis n={n} t={t} />;
    case 'Switch': return <Frame n={n} style={{ display: 'inline-flex' }}><button role="switch" aria-checked={!!p.value} onClick={() => p.onChanged && fire(p.onChanged, [!p.value])}><SwitchVis on={!!p.value} t={t} /></button></Frame>;
    case 'Checkbox': return <Frame n={n} style={{ display: 'inline-flex', padding: 8 }}><button role="checkbox" aria-checked={!!p.value} onClick={() => p.onChanged && fire(p.onChanged, [!p.value])}><CheckVis on={!!p.value} t={t} /></button></Frame>;
    case 'Slider': {
      const min = p.min ? numVal(p.min) : 0, max = p.max ? numVal(p.max) : 1;
      const step = p.divisions ? (max - min) / p.divisions : (max - min) / 100;
      return <Frame n={n} style={{ width: '100%', padding: '8px 16px' }}><input aria-label={p.label ?? 'slider'} type="range" min={min} max={max} step={step} value={numVal(p.value)} onChange={(e) => p.onChanged && fire(p.onChanged, [new DDouble(Number(e.target.value))])} style={{ width: '100%', accentColor: t.primary }} /></Frame>;
    }
    case 'DropdownButton': {
      const items = slots(n, 'items');
      const idx = items.findIndex((i) => api.interp.eq(i.props.value, p.value));
      return <Frame n={n} style={{ padding: '4px 8px' }}><select value={idx} onChange={(e) => p.onChanged && fire(p.onChanged, [items[Number(e.target.value)]?.props.value ?? null])} style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #79747e', background: 'transparent', color: 'inherit', minWidth: 120 }}>
        {idx < 0 && <option value={-1}>{slot(n, 'hint') ? 'Select…' : ''}</option>}
        {items.map((it, i) => <option key={it.id} value={i}>{(() => { const c = slot(it, 'child'); return c?.type === 'Text' ? c.props.data : toStr(it.props.value); })()}</option>)}
      </select></Frame>;
    }
    case 'CircleAvatar': { const r = p.radius ? numVal(p.radius) : 20; return <Frame n={n} style={{ width: r * 2, height: r * 2, borderRadius: '50%', background: col(p.backgroundColor) ?? t.primaryContainer, color: col(p.foregroundColor) ?? t.onSurface, display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: r * 0.7 }}><Kid n={slot(n, 'child')} /></Frame>; }
    case 'Image': return <Frame n={n} style={{ width: px(p.width) ?? '100%', height: px(p.height) ?? '120px', background: 'repeating-linear-gradient(45deg,#e7e0ec,#e7e0ec 8px,#f3edf7 8px,#f3edf7 16px)', display: 'grid', placeItems: 'center', color: '#49454f', fontSize: 12, textAlign: 'center', borderRadius: 4 }}>🖼 {n.ctor === 'network' ? 'Network image (not fetched offline)' : `Asset: ${p.name}`}</Frame>;
    case 'GestureDetector': case 'InkWell':
      return <Frame n={n} style={{ cursor: p.onTap ? 'pointer' : undefined, borderRadius: p.borderRadius ? `${p.borderRadius.props.r}px` : undefined }}><div role={p.onTap ? 'button' : undefined} onClick={() => p.onTap && fire(p.onTap)} onDoubleClick={() => p.onDoubleTap && fire(p.onDoubleTap)} onContextMenu={(e) => { if (p.onLongPress) { e.preventDefault(); fire(p.onLongPress); } }}><Kid n={slot(n, 'child')} /></div></Frame>;
    case 'Wrap': return <Frame n={n} style={{ display: 'flex', flexWrap: 'wrap', gap: `${px(p.runSpacing) ?? '0px'} ${px(p.spacing) ?? '0px'}` }}>{slots(n, 'children').map((c) => <Kid key={c.id} n={c} />)}</Frame>;
    case 'Opacity': case 'AnimatedOpacity': return <Frame n={n} style={{ opacity: numVal(p.opacity), transition: n.type === 'AnimatedOpacity' ? motion : undefined }}><Kid n={slot(n, 'child')} /></Frame>;
    case 'AspectRatio': return <Frame n={n} style={{ aspectRatio: String(numVal(p.aspectRatio)), width: '100%' }}><Kid n={slot(n, 'child')} bounded /></Frame>;
    case 'ConstrainedBox': return <Frame n={n} style={{ maxWidth: px(p.constraints?.props?.maxWidth), minWidth: px(p.constraints?.props?.minWidth), maxHeight: px(p.constraints?.props?.maxHeight), minHeight: px(p.constraints?.props?.minHeight), width: '100%' }}><Kid n={slot(n, 'child')} /></Frame>;
    case 'Tooltip': return <Frame n={n}><div title={p.message}><Kid n={slot(n, 'child')} /></div></Frame>;
    case 'Semantics': return <Frame n={n}><div aria-label={p.label}><Kid n={slot(n, 'child')} /></div></Frame>;
    case 'Visibility': return p.visible === false ? (slot(n, 'replacement') ? <Kid n={slot(n, 'replacement')} /> : null) : <Kid n={slot(n, 'child')} />;
    case 'CircularProgressIndicator': return <Frame n={n} style={{ width: 36, height: 36, borderRadius: '50%', border: `4px solid ${t.primaryContainer}`, borderTopColor: col(p.color) ?? t.primary, animation: api.reducedMotion ? undefined : 'spin 1s linear infinite' }} />;
    case 'LinearProgressIndicator': return <Frame n={n} style={{ width: '100%', height: px(p.minHeight) ?? '4px', background: col(p.backgroundColor) ?? t.primaryContainer, borderRadius: 2, overflow: 'hidden' }}><div style={{ width: p.value ? `${numVal(p.value) * 100}%` : '40%', height: '100%', background: col(p.color) ?? t.primary }} /></Frame>;
    case 'Chip': return <Frame n={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #79747e', background: col(p.backgroundColor), fontSize: 14, margin: 2 }}><Kid n={slot(n, 'avatar')} /><Kid n={slot(n, 'label')} />{p.onDeleted && <button aria-label="Delete" onClick={() => fire(p.onDeleted)}>✕</button>}</Frame>;
    case 'Placeholder': return <Frame n={n} style={{ height: px(p.fallbackHeight) ?? '100px', width: '100%', border: `2px solid ${col(p.color) ?? '#455a64'}`, background: 'linear-gradient(to top right, transparent calc(50% - 1px), #455a64, transparent calc(50% + 1px)), linear-gradient(to top left, transparent calc(50% - 1px), #455a64, transparent calc(50% + 1px))' }} />;
    case 'BottomNavigationBar': return <Frame n={n} style={{ display: 'flex', height: 72, background: t.dark ? '#211f26' : '#f3edf7' }}>{slots(n, 'items').map((it, i) => <button key={it.id} onClick={() => p.onTap && fire(p.onTap, [i])} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 12, color: i === (p.currentIndex ?? 0) ? t.primary : 'inherit', fontWeight: i === (p.currentIndex ?? 0) ? 700 : 400 }}><Kid n={slot(it, 'icon')} />{it.props.label}</button>)}</Frame>;
    case 'AlertDialog': return <Frame n={n} style={{ background: t.dark ? '#2b2930' : '#ece6f0', borderRadius: 28, padding: 24, minWidth: 260, maxWidth: '90%' }}><div style={{ fontSize: 22, marginBottom: 12 }}><Kid n={slot(n, 'title')} /></div><div style={{ fontSize: 14, marginBottom: 16 }}><Kid n={slot(n, 'content')} /></div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{slots(n, 'actions').map((c) => <Kid key={c.id} n={c} />)}</div></Frame>;
    case 'SafeArea': case 'Hero': case 'Form': return <Frame n={n} style={{ display: 'contents' }}><Kid n={slot(n, 'child')} /></Frame>;
  }
  return <Frame n={n} style={{ padding: 4, border: '1px dashed #f43f5e', fontSize: 11 }}>{n.type}</Frame>;
}

function SwitchVis({ on, t }: { on: boolean; t: Record<string, string> }) {
  return <span style={{ width: 52, height: 32, borderRadius: 16, background: on ? t.primary : '#e6e0e9', border: on ? 'none' : '2px solid #79747e', position: 'relative', display: 'inline-block', boxSizing: 'border-box', transition: 'background .15s' }}><span style={{ position: 'absolute', top: '50%', left: on ? 24 : 4, width: on ? 24 : 16, height: on ? 24 : 16, transform: 'translateY(-50%)', borderRadius: '50%', background: on ? t.onPrimary : '#79747e', transition: 'all .15s' }} /></span>;
}
function CheckVis({ on, t }: { on: boolean; t: Record<string, string> }) {
  return <span style={{ width: 18, height: 18, borderRadius: 2, border: on ? 'none' : '2px solid #49454f', background: on ? t.primary : 'transparent', color: t.onPrimary, display: 'inline-grid', placeItems: 'center', fontSize: 13, boxSizing: 'border-box' }}>{on ? '✓' : ''}</span>;
}
function FieldVis({ n, t }: { n: RNode; t: Record<string, string> }) {
  const api = useContext(Ctx)!;
  const p = n.props;
  const store: Map<string, string> = (api.interp.hooks.fieldText ??= new Map());
  const [, force] = useState(0);
  const ctrl = p.controller instanceof NObj ? p.controller : null;
  const value = ctrl ? ctrl.props.text : store.get(n.id) ?? p.initialValue ?? '';
  const dec = p.decoration instanceof NObj ? p.decoration.props : {};
  const err = (n.type === 'TextFormField' ? api.interp.hooks.fieldErr?.get(n.id) : null) ?? dec.errorText;
  const focused = p.focusNode instanceof NObj && p.focusNode.props.hasFocus;
  return <Frame n={n} style={{ padding: '6px 4px', width: '100%' }}>
    <label style={{ display: 'block', fontSize: 12, color: err ? t.error : t.primary, marginBottom: 2, minHeight: 4 }}>{dec.labelText}</label>
    <input
      value={value} placeholder={dec.hintText} type={p.obscureText ? 'password' : 'text'} disabled={p.enabled === false} autoFocus={focused}
      onChange={(e) => {
        const v = e.target.value;
        store.set(n.id, v);
        if (ctrl) { ctrl.props.text = v; ctrl.props.__onSet?.(); }
        if (p.onChanged) api.fire(p.onChanged, [v]); else { force((x) => x + 1); api.fire(null, []); }
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') { const cb = p.onSubmitted ?? p.onFieldSubmitted; if (cb) api.fire(cb, [value]); } }}
      style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 4, border: `1px solid ${err ? t.error : focused ? t.primary : '#79747e'}`, background: 'transparent', color: 'inherit', fontSize: 16, outlineColor: t.primary }}
    />
    {(err || dec.helperText) && <div style={{ fontSize: 12, color: err ? t.error : undefined, marginTop: 2 }}>{err ?? dec.helperText}</div>}
  </Frame>;
}

export function PreviewSurface({ tree, api }: { tree: RNode | null; api: PreviewApi }) {
  return <Ctx.Provider value={api}><Bounded.Provider value={true}>{tree ? <W n={tree} /> : null}</Bounded.Provider></Ctx.Provider>;
}

export function describeProps(n: RNode): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(n.props)) {
    if (k.startsWith('__') || n.slots[k] !== undefined) continue;
    let s: string;
    if (v instanceof Closure || v instanceof NativeFn) s = 'ƒ callback';
    else if (v instanceof NObj && v.kind === 'TextEditingController') s = `controller("${v.props.text}")`;
    else s = toStr(v);
    out.push([k, s.length > 60 ? s.slice(0, 57) + '…' : s]);
  }
  for (const k of Object.keys(n.slots)) out.push([k, Array.isArray(n.slots[k]) ? `[${(n.slots[k] as RNode[]).length} widgets]` : (n.slots[k] as RNode | null)?.type ?? 'null']);
  return out;
}
