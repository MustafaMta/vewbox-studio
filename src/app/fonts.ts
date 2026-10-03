import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from 'next/font/google';

/** THE FACES — owned by DS (docs/DESIGN-SYSTEM-V5.md §3.1; §11.2 DS-1). Three voices, three families, all SIL Open
 *  Font License, through `next/font/google`: the files are downloaded once when the app is built (or first compiled
 *  in development) and served from this origin with the app's own assets, so the studio makes no request to a font
 *  service at runtime and works on a closed network. The Google-distributed builds are used as they are: IBM Plex's
 *  Reserved Font Name forbids renaming or subsetting it ourselves (§3.1 licence notes).
 *
 *    title      Newsreader (opsz 6–72, wght 200–800, italic) — content names and page titles
 *    interface  IBM Plex Sans (wdth 75–100, wght 100–700)
 *    readout    IBM Plex Mono (400 · 500) — the production's numbers
 *
 *  The website is English-only (the producer's decision of 2026-10-03): no interface face for another script is
 *  loaded. The work itself is not English-only — a character called أبو سلام, a line of Iraqi dialogue, a lyric, a
 *  subtitle — so every stack (tokens.css: --font-ui, --font-title, --font-mono) falls back to the operating system's
 *  own Arabic faces (Segoe UI and Tahoma on Windows, Geeza Pro / SF Arabic on macOS and iOS, Noto on Android and
 *  Linux). Each face here declares a CSS variable on <html> (`fontVariables`). Weights are §3.2's: titles 500,
 *  interface 400 / 500 / 600 (700 for the rare bold), readouts 400 / 500. Inter is gone (v4's face; audit 14).
 *  `display: swap`: a missing download degrades to a readable page, never to invisible text. `adjustFontFallback`
 *  is off: next/font's metric-matched fallback is a local Arial, which would also draw every Arabic glyph ahead of the
 *  system's proper Arabic faces; the token stacks name those faces instead. */
export const newsreader = Newsreader({
  subsets: ['latin', 'latin-ext'], style: ['normal', 'italic'], axes: ['opsz'], display: 'swap',
  variable: '--font-newsreader', adjustFontFallback: false,
});
export const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'], axes: ['wdth'], display: 'swap',
  variable: '--font-plex-sans', adjustFontFallback: false,
});
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400', '500'], display: 'swap',
  variable: '--font-plex-mono', adjustFontFallback: false,
});

/** The class names that declare the three `--font-*` variables on <html>. */
export const fontVariables = [newsreader, plexSans, plexMono].map((f) => f.variable).join(' ');
