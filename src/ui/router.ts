import { useSyncExternalStore } from 'react';

const sub = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); };
export function useRoute(): string[] {
  const h = useSyncExternalStore(sub, () => window.location.hash, () => window.location.hash);
  return h.replace(/^#\/?/, '').split('/').filter(Boolean);
}
export function go(path: string) { window.location.hash = path.startsWith('/') ? path : '/' + path; window.scrollTo({ top: 0 }); }
