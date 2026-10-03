import type { Metadata, Viewport } from 'next';
import './globals.css';
import { fontVariables } from './fonts';
import { BOOT } from './boot';
import { StudioProvider } from '@/studio/store';
import { LocaleProvider } from '@/components/ui/locale';
import { ToastProvider } from '@/components/ui/toast';
import { PlayerProvider } from '@/components/players/PlayerProvider';

/** The fallback title before a page names itself: every route renders its own (src/components/shell/DocumentTitle,
 *  docs/DESIGN-SYSTEM-V4.md §7.3). */
export const metadata: Metadata = { title: { default: 'Vewbox Studio', template: '%s · Vewbox Studio' }, description: 'Plan, design and produce original shows, short films and music videos — the studio’s interface, on sample content.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0b0d12' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={fontVariables}>
      <head>
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
