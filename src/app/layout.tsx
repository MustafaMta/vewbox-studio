import type { Metadata, Viewport } from 'next';
import './globals.css';
import { StudioProvider } from '@/demo/store';
import { LocaleProvider } from '@/components/ui/locale';
import { ToastProvider } from '@/components/ui/toast';
import { PlayerProvider } from '@/components/players/PlayerProvider';

export const metadata: Metadata = { title: { default: 'Vewbox Studio', template: '%s · Vewbox Studio' }, description: 'Plan, design and produce original shows, short films and music videos — the studio’s interface, on sample content.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0b0d12' };

/** Applies the saved interface language and motion preference before the first paint, so an Arabic studio never
 *  flashes English. Reads only this app's own key in localStorage. */
const BOOT = `try{var u=JSON.parse(localStorage.getItem('vewbox.ui')||'{}');var h=document.documentElement;if(u.locale==='ar'){h.lang='ar';h.dir='rtl'}if(u.motion){h.setAttribute('data-motion','reduce')}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />
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
