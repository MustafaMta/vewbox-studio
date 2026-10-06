import localFont from 'next/font/local';

/** THE FACES — owned by DS (docs/design/VISUAL-STANDARD-V5.1.md §4.1). Two families, both SIL Open Font License,
 *  SELF-HOSTED through 
ext/font/local`: the variable files of the `geist` package (v1.7.2, Vercel — licence in
 *  ./fonts/OFL-Geist.txt) are committed in ./fonts, so a build needs no network (a build that fetched them from Google
 *  Fonts failed on the workstation's network) and the studio makes no request to a font service, ever.
 *
 *    interface and titles   Geist (variable wght 100–900; 400 · 500 · 600 used)
 *    readouts               Geist Mono (variable; 400 · 500) — timecode, durations, shot/take/cut numbers, counts
 *
 *  Newsreader and IBM Plex are retired. The website is English-only; the work is not (a character called أبو سلام, a
 *  line of Iraqi dialogue), so the stacks in tokens.css (--font-ui, --font-mono) fall back to the operating system's
 *  own Arabic faces. `display: swap`: a missing file degrades to a readable page, never to invisible text.
 *  `adjustFontFallback` is off: next/font's metric-matched fallback is a local Arial, which would also draw every
 *  Arabic glyph ahead of the system's proper Arabic faces. */
const Geist = localFont({ src: './fonts/Geist-Variable.woff2', weight: '100 900', style: 'normal', variable: '--font-geist', display: 'swap', adjustFontFallback: false });
const GeistMono = localFont({ src: './fonts/GeistMono-Variable.woff2', weight: '100 900', style: 'normal', variable: '--font-geist-mono', display: 'swap', adjustFontFallback: false });

// next/font/local names a family after its constant: Geist and GeistMono (the Google build said Geist Mono)
/** The class names that declare the two `--font-*` variables on <html>. */
export const geist = Geist;
export const geistMono = GeistMono;
export const fontVariables = [Geist, GeistMono].map((f) => f.variable).join(' ');
