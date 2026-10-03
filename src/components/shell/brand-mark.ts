/** THE BRAND MARK — the violet gradient tile with its lens and V, kept for the one place it remains: the favicon
 *  (docs/DESIGN-SYSTEM-V4.md §2.5: "Favicon, loading splash, sign-in, onboarding"; never the product UI, V4-08). A
 *  plain module (no React), so the root layout can put it in its metadata as a data: URI. */

const C = { top: '#8B7BF8', mid: '#6A57EE', end: '#4A3AD0', white: '#FFFFFF', lilac: '#E4DEFF' }; // v4-lint: allow raw-colour — the favicon's gradient stops (§2.5)

export const BRAND_MARK_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none">',
  `<defs><linearGradient id="t" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="${C.top}"/><stop offset="0.55" stop-color="${C.mid}"/><stop offset="1" stop-color="${C.end}"/></linearGradient>`,
  `<linearGradient id="v" x1="12" y1="12" x2="28" y2="30" gradientUnits="userSpaceOnUse"><stop stop-color="${C.white}"/><stop offset="1" stop-color="${C.lilac}"/></linearGradient></defs>`,
  '<rect x="0.75" y="0.75" width="38.5" height="38.5" rx="11.5" fill="url(#t)"/>',
  `<path d="M28.6 10.6a12 12 0 1 0 3.1 6.1" stroke="${C.white}" stroke-opacity="0.5" stroke-width="2" stroke-linecap="round"/>`,
  '<path d="M13.4 14.2 20 26.4l6.6-12.2" stroke="url(#v)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
  '</svg>',
].join('');

export const BRAND_MARK_DATA_URI = `data:image/svg+xml,${encodeURIComponent(BRAND_MARK_SVG)}`;
