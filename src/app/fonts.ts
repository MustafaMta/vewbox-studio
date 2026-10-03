import { Geist, Geist_Mono } from 'next/font/google';

/** THE FACES — owned by DS (docs/design/VISUAL-STANDARD-V5.1.md §4.1). Two families, both SIL Open Font License,
 *  through `next/font/google`: the files are downloaded once when the app is built (or first compiled in development)
 *  and served from this origin, so the studio makes no request to a font service at runtime.
 *
 *    interface and titles   Geist (variable wght; 400 · 500 · 600 used)
 *    readouts               Geist Mono (400 · 500) — timecode, durations, shot/take/cut numbers, counts
 *
 *  Newsreader and IBM Plex are retired. The website is English-only; the work is not (a character called أبو سلام, a
 *  line of Iraqi dialogue), so the stacks in tokens.css (--font-ui, --font-mono) fall back to the operating system's
 *  own Arabic faces. `display: swap`: a missing download degrades to a readable page, never to invisible text.
 *  `adjustFontFallback` is off: next/font's metric-matched fallback is a local Arial, which would also draw every
 *  Arabic glyph ahead of the system's proper Arabic faces. */
export const geist = Geist({ subsets: ['latin', 'latin-ext'], variable: '--font-geist', display: 'swap', adjustFontFallback: false });
export const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap', adjustFontFallback: false });

/** The class names that declare the two `--font-*` variables on <html>. */
export const fontVariables = [geist, geistMono].map((f) => f.variable).join(' ');
