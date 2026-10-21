// Render smoke test: every screen renders without throwing (server-side render, no browser).
import { describe, it, expect, beforeAll } from 'vitest';
import { renderToString } from 'react-dom/server';

beforeAll(() => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) }; };
  (globalThis as any).window = { location: { hash: '' }, innerWidth: 390, innerHeight: 844, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), scrollTo() {} };
  (globalThis as any).sessionStorage = mem();
});

describe('Every screen renders', async () => {
  const { HomePage, GrandTestPage } = await import('../src/pages/HomeGrand');
  const { LearnPage, LessonPage } = await import('../src/pages/LessonPages');
  const { CodeLabPage, PracticePage, ProjectsPage } = await import('../src/pages/LabPractice');
  const { ProgressPage, SettingsPage, AboutPage } = await import('../src/pages/ProgressSettings');
  const { DistinctionsPage } = await import('../src/pages/Distinctions');
  const { actions } = await import('../src/domain/store');
  const pages: [string, () => any, string][] = [
    ['Home', () => <HomePage />, 'Start lesson 1'], ['Learn', () => <LearnPage />, 'Grand Test 1'], ['Lesson 18 content', () => <LessonPage n={18} tab="content" />, 'Supported interpreter code'],
    ['Lesson 1 exam', () => <LessonPage n={1} tab="exam" />, 'Q1.'], ['Lesson 1 practical', () => <LessonPage n={1} tab="practical" />, 'Submit for grading'],
    ['Locked lesson 50', () => <LessonPage n={50} tab="exam" />, 'Locked'], ['Grand test', () => <GrandTestPage k={1} />, 'Complete lessons'],
    ['Code Lab', () => <CodeLabPage />, 'Run'], ['Practice', () => <PracticePage />, 'Generate drill'], ['Projects', () => <ProjectsPage />, 'Capstone'],
    ['Capstone project', () => <ProjectsPage id="capstone" />, 'Complete lesson 119'], ['Progress', () => <ProgressPage />, 'Curriculum map'],
    ['Settings', () => <SettingsPage />, 'Run time limit'], ['About', () => <AboutPage />, 'feasibility'], ['Distinctions', () => <DistinctionsPage />, 'Widget configuration'],
  ];
  for (const [name, el, text] of pages) it(name, () => { const h = renderToString(el()).replace(/<!-- -->/g, ''); expect(h.length).toBeGreaterThan(500); expect(h).toContain(text); });
  it('bookmarks and notes appear on the lesson page', () => {
    actions.toggleBookmark(18); actions.saveNote(18, 'my note');
    const h = renderToString(<LessonPage n={18} tab="content" />);
    expect(h).toContain('Bookmarked'); expect(h).toContain('my note');
  });
});
