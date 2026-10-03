import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic, Markazi_Text, Newsreader } from 'next/font/google';

/** THE FACES — owned by DS (docs/DESIGN-SYSTEM-V5.md §3.1; §11.2 DS-1). Three voices in five families, all SIL Open
 *  Font License, through `next/font/google`: the files are downloaded once when the app is built (or first compiled
 *  in development) and served from this origin with the app's own assets, so the studio makes no request to a font
 *  service at runtime and works on a closed network. The Google-distributed builds are used as they are: IBM Plex's
 *  Reserved Font Name forbids renaming or subsetting it ourselves (§3.1 licence notes).
 *
 *    title      Newsreader (opsz 6–72, wght 200–800, italic) · Markazi Text (wght 400–700, Arabic + Latin)
 *    interface  IBM Plex Sans (wdth 75–100, wght 100–700) · IBM Plex Sans Arabic (400 · 500 · 600 · 700)
 *    readout    IBM Plex Mono (400 · 500) — Western digits only; Arabic-Indic digits never meet it (§9.4)
 *
 *  Each face declares a CSS variable on <html> (`fontVariables`); the stacks are tokens (styles/tokens.css:
 *  --font-ui, --font-ui-ar, --font-title, --font-title-ar, --font-mono). The weights are the ones §3.2 uses: titles
 *  500 (Latin) / 600 (Arabic), interface 400 / 500 / 600 (700 for the rare bold), readouts 400 / 500. Inter is gone
 *  (v4's face; audit 14). The fallbacks are system faces of the same kind, so a missing download degrades to a
 *  readable page, never to invisible text (`display: swap`). */
export const newsreader = Newsreader({
  subsets: ['latin', 'latin-ext'], style: ['normal', 'italic'], axes: ['opsz'], display: 'swap',
  variable: '--font-newsreader', fallback: ['Georgia', 'Times New Roman', 'serif'],
});
export const markazi = Markazi_Text({
  subsets: ['arabic', 'latin'], display: 'swap',
  variable: '--font-markazi', fallback: ['Noto Naskh Arabic', 'Times New Roman', 'serif'],
});
export const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'], axes: ['wdth'], display: 'swap',
  variable: '--font-plex-sans', fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
});
export const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'], display: 'swap',
  variable: '--font-plex-arabic', fallback: ['Noto Sans Arabic', 'Segoe UI', 'system-ui', 'sans-serif'],
});
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400', '500'], display: 'swap',
  variable: '--font-plex-mono', fallback: ['ui-monospace', 'Cascadia Mono', 'Consolas', 'monospace'],
});

/** The class names that declare the five `--font-*` variables on <html>. */
export const fontVariables = [newsreader, markazi, plexSans, plexArabic, plexMono].map((f) => f.variable).join(' ');
