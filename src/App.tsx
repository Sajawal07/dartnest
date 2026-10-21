import { useEffect, useState } from 'react';
import { useRoute, go } from './ui/router';
import { useStore } from './domain/store';
import { project } from './domain/progression';
import { HomePage, GrandTestPage } from './pages/HomeGrand';
import { LearnPage, LessonPage } from './pages/LessonPages';
import { CodeLabPage, PracticePage, ProjectsPage } from './pages/LabPractice';
import { ProgressPage, SettingsPage, AboutPage } from './pages/ProgressSettings';
import { DistinctionsPage } from './pages/Distinctions';

const NAV: [string, string, string][] = [
  ['', '⌂', 'Home'], ['learn', '📘', 'Learn'], ['lab', '⌨', 'Code Lab'], ['practice', '🎯', 'Practice'],
  ['projects', '🧩', 'Projects'], ['progress', '📈', 'Progress'], ['settings', '⚙', 'Settings'],
];

// Apply saved theme BEFORE React hydrates to avoid blank/flash screen on dark mode
if (typeof window !== 'undefined') {
  try {
    const stored = JSON.parse(localStorage.getItem('dartnest-store') || '{}');
    const theme = stored?.settings?.theme ?? 'system';
    const sysDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    if (theme === 'dark' || (theme === 'system' && sysDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch {}
}

function useTheme() {
  const settings = useStore((s) => s.settings);
  const [sysDark, setSysDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const f = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq?.addEventListener('change', f);
    return () => mq?.removeEventListener('change', f);
  }, []);
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && sysDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
  }, [dark, settings.reducedMotion]);
}

export default function App() {
  useTheme();
  const r = useRoute();
  const hist = useStore((s) => s);
  const p = project(hist);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off); }; }, []);
  const [kb, setKb] = useState(false); // hide bottom nav while the on-screen keyboard is likely open
  useEffect(() => {
    const isField = (t: any) => t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'file'].includes(t.type)));
    const on = (e: FocusEvent) => setKb(isField(e.target) && window.innerWidth < 1024);
    const off = () => setKb(false);
    document.addEventListener('focusin', on); document.addEventListener('focusout', off);
    return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off); };
  }, []);
  const top = r[0] ?? '';
  let page;
  switch (top) {
    case '': page = <HomePage />; break;
    case 'learn': page = <LearnPage />; break;
    case 'lesson': page = <LessonPage key={r[1]} n={Math.max(1, Math.min(120, Number(r[1]) || 1))} tab={r[2] ?? 'content'} />; break;
    case 'grand': page = <GrandTestPage key={r[1]} k={Number(r[1]) || 1} />; break;
    case 'lab': page = <CodeLabPage />; break;
    case 'practice': page = <PracticePage />; break;
    case 'projects': page = <ProjectsPage id={r[1]} />; break;
    case 'progress': page = <ProgressPage />; break;
    case 'settings': page = <SettingsPage />; break;
    case 'about': page = <AboutPage />; break;
    case 'distinctions': page = <DistinctionsPage />; break;
    default: page = <HomePage />;
  }
  const active = (k: string) => (k === '' ? top === '' : top === k || (k === 'learn' && (top === 'lesson' || top === 'grand' || top === 'distinctions')) || (k === 'settings' && top === 'about'));
  return (
    <div className="min-h-screen lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-[var(--card)] focus:p-2 focus:rounded">Skip to content</a>
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-[var(--line)] bg-[var(--card)] p-4 gap-1" aria-label="Main navigation">
        <button onClick={() => go('/')} className="flex items-center gap-2 mb-4 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white font-black">F</span>
          <span className="text-left leading-tight"><span className="block font-bold">Flutter Academy</span><span className="block text-xs text-[var(--muted)]">Offline · {p.completedCount}/120 lessons</span></span>
        </button>
        {NAV.map(([k, icon, label]) => <button key={k} onClick={() => go('/' + k)} aria-current={active(k) ? 'page' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active(k) ? 'bg-[var(--accent)] text-white shadow' : 'hover:bg-[var(--chip)]'}`}><span aria-hidden className="w-5 text-center">{icon}</span>{label}</button>)}
        <div className="mt-auto text-xs text-[var(--muted)] px-2 space-y-1">
          <div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />{online ? 'Online — not required' : 'Offline mode — fully functional'}</div>
          <div>No account · data stays on device</div>
        </div>
      </aside>
      <header className="lg:hidden sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--line)] bg-[var(--card)]/90 backdrop-blur px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 text-white font-black text-sm">F</span>
        <span className="font-bold">Flutter Academy</span>
        <span className="ml-auto text-xs text-[var(--muted)] flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />{online ? 'Online' : 'Offline'}</span>
        <button onClick={() => go('/settings')} aria-label="Settings" className="rounded-lg p-1.5 hover:bg-[var(--chip)]">⚙</button>
      </header>
      <main id="main" key={r.slice(0, 2).join('/')} className="mx-auto max-w-6xl px-4 py-5 pb-28 lg:pb-10 sm:px-6 anim-up">{page}</main>
      <nav hidden={kb} className="lg:hidden fixed bottom-0 inset-x-0 z-20 border-t border-[var(--line)] bg-[var(--card)]/95 backdrop-blur grid grid-cols-6 pb-[env(safe-area-inset-bottom)]" aria-label="Main navigation">
        {NAV.slice(0, 6).map(([k, icon, label]) => <button key={k} onClick={() => go('/' + k)} aria-current={active(k) ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${active(k) ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}><span className={`text-lg leading-none rounded-full px-3 py-1 ${active(k) ? 'bg-[var(--accent)]/15' : ''}`} aria-hidden>{icon}</span>{label}</button>)}
      </nav>
    </div>
  );
}
