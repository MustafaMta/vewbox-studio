/** INTERFACE PREFERENCES THE PLAYERS READ (docs/DESIGN-SYSTEM-V4.md §4.9). F4's boot script applies them to <html>
 *  before the first paint; until it does, the same facts are read from this app's own localStorage key (`vewbox.ui`).
 *  The contract with F4: `html[data-previews="off"]` or `{"previews": false}` turns hero previews off;
 *  `html[data-keys="off"]` or `{"keys": false}` turns single-key shortcuts off; `html[data-motion="reduce"]` or
 *  `{"motion": true}` (exists) and the OS setting reduce motion. Every read is safe on the server. */

function ui(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem('vewbox.ui') ?? '{}') as Record<string, unknown>; } catch { return {}; }
}
const html = () => (typeof document === 'undefined' ? null : document.documentElement);

export function prefersReducedMotion(): boolean {
  const h = html(); if (!h) return true;
  if (h.getAttribute('data-motion') === 'reduce') return true;
  try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch { /* old browser */ }
  return ui().motion === true;
}

export function heroPreviewsOn(): boolean {
  const h = html(); if (!h) return false;
  if (h.getAttribute('data-previews') === 'off') return false;
  return ui().previews !== false;
}

export function singleKeysOn(): boolean {
  const h = html(); if (!h) return true;
  if (h.getAttribute('data-keys') === 'off') return false;
  return ui().keys !== false;
}

/** The browser asked to save data (Network Information API, where it exists). */
export function savesData(): boolean {
  if (typeof navigator === 'undefined') return true;
  return Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
}

