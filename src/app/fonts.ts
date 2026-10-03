import localFont from 'next/font/local';

/** THE INTERFACE FACES — owned by F1 (docs/DESIGN-SYSTEM-V4.md §3.1, §8.3); moved out of src/app/layout.tsx by F0.
 *  Fonts ship with the application (src/app/fonts, SIL Open Font License, licences beside the files) and are served
 *  from this origin: the studio makes no request to a font service, so it works on a closed network and contacts
 *  nothing outside itself. Inter variable (`opsz` 14–32, `wght` 100–900) for Latin, IBM Plex Sans Arabic 400–700 for
 *  Arabic. The title voice is a token over these two faces (`--font-title`, §3.2); a new face is the title spike's
 *  decision, not this file's. */
export const inter = localFont({ src: './fonts/InterVariable.woff2', weight: '100 900', display: 'swap', variable: '--font-inter', fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'] });
export const plexArabic = localFont({
  src: [
    { path: './fonts/IBMPlexSansArabic-Regular.ttf', weight: '400' },
    { path: './fonts/IBMPlexSansArabic-Medium.ttf', weight: '500' },
    { path: './fonts/IBMPlexSansArabic-SemiBold.ttf', weight: '600' },
    { path: './fonts/IBMPlexSansArabic-Bold.ttf', weight: '700' },
  ],
  display: 'swap', variable: '--font-plex-arabic', fallback: ['Noto Sans Arabic', 'Segoe UI', 'system-ui', 'sans-serif'],
});

/** The class names that declare `--font-inter` and `--font-plex-arabic` on <html>. */
export const fontVariables = `${inter.variable} ${plexArabic.variable}`;
