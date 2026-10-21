// Local database: a versioned, migrated, transactionally-written document store persisted in
// localStorage (pluggable backend for tests). Attempt tables are append-only; progression is
// always DERIVED from them (see progression.ts), never stored.
import { useSyncExternalStore } from 'react';

export interface McqAttempt { id: string; lesson: number; score: number; total: number; passed: boolean; at: number; weakSections: string[]; reviewLessons: number[] }
export interface PracticalAttempt { id: string; lesson: number; taskId: string; score: number; passed: boolean; at: number; status: string; code: string }
export interface GrandAttempt { id: string; k: number; mcq: number; coding: number; practical: number; total: number; passed: boolean; at: number }
export interface PracticeAttempt { id: string; itemId: string; lesson: number; kind: string; correct: boolean; at: number }
export interface ProjectAttempt { id: string; projectId: string; taskId: string; score: number; passed: boolean; at: number }
export interface Snippet { id: string; name: string; code: string; updatedAt: number }
export interface Settings { theme: 'light' | 'dark' | 'system'; editorFont: number; reducedMotion: boolean; previewWidth: number; previewHeight: number; lineNumbers: boolean; runTimeout: number }
export interface AppState {
  schemaVersion: number; contentVersion: string;
  mcq: McqAttempt[]; practical: PracticalAttempt[]; grand: GrandAttempt[]; practice: PracticeAttempt[]; project: ProjectAttempt[];
  snippets: Snippet[]; drafts: Record<string, string>; settings: Settings; activity: string[]; lastLesson: number;
  bookmarks: number[]; notes: Record<string, string>;
}

export const DB_KEY = 'flutter-academy.v1';
export const SCHEMA_VERSION = 2;
export const CONTENT_VERSION = '2026.2-l120-q20-gt24';
export const DEFAULT_SETTINGS: Settings = { theme: 'system', editorFont: 14, reducedMotion: false, previewWidth: 360, previewHeight: 640, lineNumbers: true, runTimeout: 3000 };
export const emptyState = (): AppState => ({ schemaVersion: SCHEMA_VERSION, contentVersion: CONTENT_VERSION, mcq: [], practical: [], grand: [], practice: [], project: [], snippets: [], drafts: {}, settings: { ...DEFAULT_SETTINGS }, activity: [], lastLesson: 1, bookmarks: [], notes: {} });

// ---------- storage backend ----------
export interface Backend { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export const memoryBackend = (): Backend => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } }; };
let backend: Backend = typeof localStorage !== 'undefined' ? localStorage : memoryBackend();

// ---------- migrations ----------
/** Each migration upgrades from version N to N+1. Never edit a released migration; add a new one. */
export const MIGRATIONS: Record<number, (s: any) => any> = {
  0: (s) => ({ ...s, version: 1 }),
  1: (s) => {
    const { version: _v, ...rest } = s;
    return { ...rest, schemaVersion: 2, bookmarks: [], notes: {}, settings: { ...(s.settings ?? {}), runTimeout: 3000 } };
  },
};
export function migrate(raw: any): { state: any; from: number; steps: number[] } {
  let s = raw && typeof raw === 'object' ? raw : {};
  let v = typeof s.schemaVersion === 'number' ? s.schemaVersion : typeof s.version === 'number' ? s.version : 0;
  const from = v; const steps: number[] = [];
  if (v > SCHEMA_VERSION) throw new Error(`Data was written by a newer app version (schema ${v}).`);
  while (v < SCHEMA_VERSION) { s = MIGRATIONS[v](s); steps.push(v); v++; }
  return { state: s, from, steps };
}

// ---------- validation (rejects invalid / tampered records) ----------
const isInt = (x: any, lo: number, hi: number) => Number.isInteger(x) && x >= lo && x <= hi;
export function sanitize(p: any): AppState {
  const e = emptyState();
  if (!p || typeof p !== 'object') return e;
  const arr = (x: any) => (Array.isArray(x) ? x : []);
  const id = (a: any) => (typeof a.id === 'string' && a.id ? a.id : uid());
  return {
    schemaVersion: SCHEMA_VERSION, contentVersion: CONTENT_VERSION,
    mcq: arr(p.mcq).filter((a: any) => isInt(a.lesson, 1, 120) && isInt(a.score, 0, 20) && a.total === 20).map((a: any) => ({ weakSections: [], reviewLessons: [], at: 0, ...a, id: id(a), passed: a.score >= 15 })),
    practical: arr(p.practical).filter((a: any) => isInt(a.lesson, 1, 120) && typeof a.score === 'number' && a.score >= 0 && a.score <= 100).map((a: any) => ({ code: '', status: 'graded', taskId: '', at: 0, ...a, id: id(a), passed: a.score >= 70 && a.passed === true })),
    grand: arr(p.grand).filter((a: any) => isInt(a.k, 1, 24) && isInt(a.mcq, 0, 20) && isInt(a.coding, 0, 10) && isInt(a.practical, 0, 20)).map((a: any) => { const total = a.mcq + a.coding + a.practical; return { at: 0, ...a, id: id(a), total, passed: total >= 38 && a.practical >= 12 }; }),
    practice: arr(p.practice).filter((a: any) => typeof a.lesson === 'number'),
    project: arr(p.project).filter((a: any) => typeof a.projectId === 'string' && typeof a.score === 'number').map((a: any) => ({ ...a, id: id(a), passed: a.score >= 70 })),
    snippets: arr(p.snippets).filter((s: any) => typeof s.code === 'string' && typeof s.name === 'string').map((s: any) => ({ updatedAt: 0, ...s, id: id(s) })),
    drafts: p.drafts && typeof p.drafts === 'object' ? p.drafts : {},
    settings: validSettings({ ...DEFAULT_SETTINGS, ...(p.settings ?? {}) }),
    activity: arr(p.activity).filter((d: any) => typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d)),
    lastLesson: isInt(p.lastLesson, 1, 120) ? p.lastLesson : 1,
    bookmarks: [...new Set(arr(p.bookmarks).filter((n: any) => isInt(n, 1, 120)))] as number[],
    notes: p.notes && typeof p.notes === 'object' ? Object.fromEntries(Object.entries(p.notes).filter(([k, v]) => /^\d+$/.test(k) && typeof v === 'string')) as Record<string, string> : {},
  };
}
function validSettings(s: Settings): Settings {
  return { ...s, theme: ['light', 'dark', 'system'].includes(s.theme) ? s.theme : 'system', editorFont: Math.min(24, Math.max(11, Number(s.editorFont) || 14)), runTimeout: Math.min(10000, Math.max(500, Number(s.runTimeout) || 3000)), reducedMotion: !!s.reducedMotion, lineNumbers: s.lineNumbers !== false };
}

export let lastLoadInfo: { migratedFrom: number; steps: number[]; error?: string } = { migratedFrom: SCHEMA_VERSION, steps: [] };
function load(): AppState {
  try {
    const raw = backend.getItem(DB_KEY);
    if (!raw) { lastLoadInfo = { migratedFrom: SCHEMA_VERSION, steps: [] }; return emptyState(); }
    const m = migrate(JSON.parse(raw));
    lastLoadInfo = { migratedFrom: m.from, steps: m.steps };
    const s = sanitize(m.state);
    if (m.steps.length) backend.setItem(DB_KEY, JSON.stringify(s));
    return s;
  } catch (err: any) { lastLoadInfo = { migratedFrom: -1, steps: [], error: String(err?.message ?? err) }; return emptyState(); }
}

let state: AppState = load();
const listeners = new Set<() => void>();
export function getState() { return state; }
export function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
export function useStore<T>(sel: (s: AppState) => T): T { return useSyncExternalStore(subscribe, () => sel(state), () => sel(state)); }

/** Transactional write: compute → validate → persist synchronously → publish. On failure nothing changes. */
export function transaction(fn: (s: AppState) => AppState): AppState {
  const next = fn(state);
  if (next === state) return state;
  const checked = sanitize(next);
  if (checked.mcq.length !== next.mcq.length || checked.grand.length !== next.grand.length || checked.practical.length !== next.practical.length) throw new Error('Transaction rejected: invalid assessment record.');
  backend.setItem(DB_KEY, JSON.stringify(next)); // throws on quota → state untouched
  state = next;
  listeners.forEach((l) => l());
  return state;
}
export const setState = transaction;

// test/dev hooks
export function __setBackend(b: Backend) { backend = b; state = load(); listeners.forEach((l) => l()); }
/** Simulates an app restart: drops in-memory state and reloads from storage (running migrations). */
export function __reload() { state = load(); listeners.forEach((l) => l()); return state; }

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function touch(s: AppState): AppState { const t = today(); return s.activity.includes(t) ? s : { ...s, activity: [...s.activity, t].slice(-400) }; }

export const actions = {
  recordMcq(a: Omit<McqAttempt, 'id' | 'at' | 'passed'>) { const at: McqAttempt = { ...a, id: uid(), at: Date.now(), passed: a.score >= 15 && a.total === 20 }; transaction((s) => touch({ ...s, mcq: [...s.mcq, at] })); return at; },
  recordPractical(a: Omit<PracticalAttempt, 'id' | 'at'>) { transaction((s) => touch({ ...s, practical: [...s.practical, { ...a, passed: a.passed && a.score >= 70, code: a.code.slice(0, 6000), id: uid(), at: Date.now() }] })); },
  recordGrand(a: Omit<GrandAttempt, 'id' | 'at' | 'passed'>) { const g: GrandAttempt = { ...a, total: a.mcq + a.coding + a.practical, id: uid(), at: Date.now(), passed: a.mcq + a.coding + a.practical >= 38 && a.practical >= 12 }; transaction((s) => touch({ ...s, grand: [...s.grand, g] })); return g; },
  recordPractice(a: Omit<PracticeAttempt, 'id' | 'at'>) { transaction((s) => touch({ ...s, practice: [...s.practice, { ...a, id: uid(), at: Date.now() }].slice(-3000) })); },
  recordProject(a: Omit<ProjectAttempt, 'id' | 'at'>) { transaction((s) => touch({ ...s, project: [...s.project, { ...a, id: uid(), at: Date.now() }] })); },
  saveDraft(key: string, code: string) { transaction((s) => ({ ...s, drafts: { ...s.drafts, [key]: code } })); },
  saveSnippet(name: string, code: string, id?: string) { const sn = { id: id ?? uid(), name, code, updatedAt: Date.now() }; transaction((s) => ({ ...s, snippets: [sn, ...s.snippets.filter((x) => x.id !== sn.id)] })); return sn; },
  deleteSnippet(id: string) { transaction((s) => ({ ...s, snippets: s.snippets.filter((x) => x.id !== id) })); },
  settings(p: Partial<Settings>) { transaction((s) => ({ ...s, settings: validSettings({ ...s.settings, ...p }) })); },
  setLastLesson(n: number) { transaction((s) => (s.lastLesson === n ? s : { ...s, lastLesson: n })); },
  toggleBookmark(n: number) { transaction((s) => ({ ...s, bookmarks: s.bookmarks.includes(n) ? s.bookmarks.filter((x) => x !== n) : [...s.bookmarks, n].sort((a, b) => a - b) })); },
  saveNote(n: number, text: string) { transaction((s) => { const notes = { ...s.notes }; if (text.trim()) notes[n] = text.slice(0, 5000); else delete notes[n]; return { ...s, notes }; }); },
  resetProgress() { transaction((s) => ({ ...emptyState(), snippets: s.snippets, settings: s.settings, bookmarks: s.bookmarks, notes: s.notes })); },
  resetAll() { backend.removeItem(DB_KEY); state = emptyState(); backend.setItem(DB_KEY, JSON.stringify(state)); listeners.forEach((l) => l()); },
  importData(json: string): string {
    const p = JSON.parse(json);
    if (p?.app !== 'flutter-academy') throw new Error('This file is not a Flutter Learning Academy export.');
    const incoming = sanitize(migrate(p.data).state);
    transaction((s) => ({
      ...s,
      snippets: [...incoming.snippets, ...s.snippets.filter((x) => !incoming.snippets.some((y) => y.id === x.id))],
      mcq: dedupe([...s.mcq, ...incoming.mcq]), practical: dedupe([...s.practical, ...incoming.practical]), grand: dedupe([...s.grand, ...incoming.grand]),
      practice: dedupe([...s.practice, ...incoming.practice]), project: dedupe([...s.project, ...incoming.project]),
      activity: [...new Set([...s.activity, ...incoming.activity])].sort(),
      bookmarks: [...new Set([...s.bookmarks, ...incoming.bookmarks])].sort((a, b) => a - b), notes: { ...incoming.notes, ...s.notes },
    }));
    return `Imported ${incoming.snippets.length} snippets and ${incoming.mcq.length + incoming.practical.length + incoming.grand.length} assessment records.`;
  },
  exportData(): string { return JSON.stringify({ app: 'flutter-academy', schemaVersion: SCHEMA_VERSION, contentVersion: CONTENT_VERSION, exportedAt: new Date().toISOString(), data: state }, null, 2); },
};
function dedupe<T extends { id: string }>(xs: T[]): T[] { const seen = new Set<string>(); return xs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))); }

export function streak(activity: string[], now = new Date()): number {
  const set = new Set(activity);
  const d = new Date(now);
  if (!set.has(today(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(today(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
