import type { Metadata, Viewport } from 'next';
import './globals.css';
import { fontVariables } from './fonts';
import { BOOT } from './boot';
import { BRAND_MARK_DATA_URI } from '@/components/shell/brand-mark';
import { StudioProvider } from '@/studio/store';
import { LocaleProvider } from '@/components/ui/locale';
import { ToastProvider } from '@/components/ui/toast';
import { PlayerProvider } from '@/components/players/PlayerProvider';

/** No `title` here: every route names itself (src/components/shell/DocumentTitle, docs/DESIGN-SYSTEM-V4.md §7.3) by
 *  rewriting the one <title> below. A metadata title would be re-inserted by the router on every navigation, ahead
 *  of the page's own. The violet brand mark is the favicon, and only the favicon (§2.5). */
export const metadata: Metadata = {
  description: 'Plan, design and produce original shows, short films and music videos.',
  icons: { icon: [{ url: BRAND_MARK_DATA_URI, type: 'image/svg+xml' }] },
};
// the browser's own chrome cannot read a CSS token: this is --bg (--ink-950, tokens.css)
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0d0c0b' }; // v4-lint: allow raw-colour — the browser chrome colour is a literal; it is --bg

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={fontVariables}>
      <head>
        <title>Vewbox Studio</title>
        {/* the interface preferences, applied before the first paint (src/app/boot.ts) */}
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
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
