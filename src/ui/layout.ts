// Pure responsive-layout rules (unit-tested). Widths are CSS px (≈ Android dp at 1x).
import { useEffect, useState } from 'react';

export type NavMode = 'bottom' | 'rail';
export const navMode = (w: number): NavMode => (w >= 1024 ? 'rail' : 'bottom');
/** Editor and preview side-by-side only when both get usable width (editor ≥ 480px, preview 372px). */
export const workspaceLayout = (w: number): 'stacked' | 'split' => (w >= 900 ? 'split' : 'stacked');
/** Scale the device frame down to fit, never up. */
export const previewScale = (available: number, deviceWidth: number) => Math.max(0.5, Math.min(1, (available - 12) / deviceWidth));
export const isLandscapePhone = (w: number, h: number) => w > h && h < 500;

export function useViewport() {
  const get = () => ({ w: typeof window !== 'undefined' ? window.innerWidth : 1280, h: typeof window !== 'undefined' ? window.innerHeight : 800 });
  const [v, setV] = useState(get);
  useEffect(() => { const f = () => setV(get()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return v;
}
