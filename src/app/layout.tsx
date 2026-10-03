import type { Metadata, Viewport } from 'next';
import './globals.css';
import { fontVariables } from './fonts';
import { BOOT } from './boot';
import { FOCUS_SCROLL } from './focus-scroll';
import { StudioProvider } from '@/studio/store';
import { LocaleProvider } from '@/components/ui/locale';
import { ToastProvider } from '@/components/ui/toast';
import { PlayerProvider } from '@/components/players/PlayerProvider';

/** THE FAVICON (docs/DESIGN-SYSTEM-V5.md §1.4): the viewfinder glyph — four frame corners (stroke 1.8 on a 26 px box,
 *  square caps) around a 3.2 px-radius dot — in ivory on the page's carbon. A data: URI, so it needs no request that
 *  the access gate (src/proxy.ts) could refuse. The violet gradient mark is retired everywhere. The browser draws a
 *  favicon outside the page, so its two colours are literals: --paper and --carbon-2 (tokens.css). */
const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0A0A09"/><g transform="translate(3 3)" fill="none" stroke="#F3EFE8" stroke-width="1.8" stroke-linecap="square"><path d="M2.5 8V3.5H7M19 3.5h4.5V8M23.5 18v4.5H19M7 22.5H2.5V18"/><circle cx="13" cy="13" r="3.2" fill="#F3EFE8" stroke="none"/></g></svg>'; // v4-lint: allow raw-colour — the favicon is drawn outside the page (§1.4)

/** No `title` here: every route names itself (src/components/shell/DocumentTitle, docs/DESIGN-SYSTEM-V4.md §7.3) by
 *  rewriting the one <title> below. A metadata title would be re-inserted by the router on every navigation, ahead
 *  of the page's own. */
export const metadata: Metadata = {
  description: 'Plan, design and produce original shows, short films and music videos.',
  icons: { icon: [{ url: `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`, type: 'image/svg+xml' }] },
};
// the browser's own chrome cannot read a CSS token: this is --page (--carbon-2, tokens.css)
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0A0A09' }; // v4-lint: allow raw-colour — the browser chrome colour is a literal; it is --page

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={fontVariables}>
      <head>
        <title>Vewbox Studio</title>
        {/* the interface preferences, applied before the first paint (src/app/boot.ts) */}
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
        {/* a keyboard-focused item half out of a strip is brought fully into it, ring included (src/app/focus-scroll.ts) */}
        <script dangerouslySetInnerHTML={{ __html: FOCUS_SCROLL }} />
      </head>
      <body className="antialiased">
        <StudioProvider>
          <LocaleProvider>
            <ToastProvider><PlayerProvider>{children}</PlayerProvider></ToastProvider>
          </LocaleProvider>
        </StudioProvider>
      </body>
    </html>
  );
}
