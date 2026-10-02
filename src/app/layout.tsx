import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import './globals.css';

/** Fonts are bundled at build time and served from this origin: the studio makes no request to a font service
 *  from the browser (it must work on a closed network, and nothing outside the studio is contacted). */
const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--font-inter', fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'] });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-plex-arabic', fallback: ['Noto Sans Arabic', 'Segoe UI', 'system-ui', 'sans-serif'] });
import { StudioProvider } from '@/studio/store';
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
    <html lang="en" dir="ltr" suppressHydrationWarning className={`${inter.variable} ${plexArabic.variable}`}>
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
