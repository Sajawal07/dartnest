# Flutter Learning Academy: verification report

## Build status
- `npm run build` succeeds and produces a single offline HTML file (`dist/index.html`). The Dart execution worker is inlined as a `data:` URL.
- **No Android APK/AAB was built.** The environment has no Flutter SDK or Android toolchain. The app runs offline in any modern browser or WebView.

## Tests actually executed (`npm test`, vitest)
| File | Tests | Result |
|---|---|---|
| tests/content-scoring.test.ts | 20 | passed |
| tests/progression-store.test.ts | 19 | passed |
| tests/interpreter.test.ts | 41 | passed |
| tests/widgets.test.tsx | 16 | passed |
| tests/projects.test.ts | 33 | passed |
| tests/pages.test.tsx | 16 | passed |
| **Total** | **145** | **145 passed, 0 failed** |

Regression coverage includes: 14/20 vs 15/20; 37/50 vs 38/50; MCQ pass with practical below 12/20; five lessons without a grand test; restart after a successful exam; repeating a failed practical; tampered local state; migrations; transactional rollback; snippet, theme and reduced-motion persistence.

Defects found and fixed by these tests: lesson intros were split at periods inside code spans; mutations made without `setState` still re-rendered (fixed with per-State build caching and const canonicalisation).

## Phase summary
1. **Feasibility**: custom parser, interpreter and preview, because real Dart can't run offline in a browser. Worker isolation added for cancellation.
2. **Foundation**: design tokens, light and dark themes, responsive nav (bottom bar / side rail), versioned DB with migrations, derived progression.
3. **Content engine**: 120 lessons, normalised content tables, ranked search, bookmarks, notes, example-category labels.
4. **Assessment**: 20-question exams with hidden keys, behavioural practical grading with partial credit, 24 grand tests, strict unlocking.
5. **Coding lab**: editor (highlighting, bracket matching, auto-indent, undo/redo, format, error lines), isolated cancellable runs, diagnostics, preview, two-way property inspector, snippets.
6. **Projects**: 15 projects (5 beginner, 5 intermediate, 5 advanced) with 32 tested milestones. The capstone combines navigation, state, persistence, validation, error handling, responsive layout and learner-written tests checked against seeded bugs.
7. **Polish**: purposeful animations (page and success transitions, quiz feedback, progress rings), reduced-motion support, safe areas, keyboard-aware nav.
8. **Verification**: type check clean, 145/145 tests, production build OK.

## Known limitations
- Not tested on physical Android hardware, with TalkBack, or with browser automation in airplane mode.
- Dart subset only. Streams, isolates, extensions, records and timers are analysis-only. Layout is approximate.
- Persistence uses localStorage, not SQLite.
