import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

/** Fonts ship with the application (src/app/fonts, SIL Open Font License) and are served from this origin: the studio
 *  makes no request to a font service, so it works on a closed network and contacts nothing outside itself. */
const inter = localFont({ src: './fonts/InterVariable.woff2', weight: '100 900', display: 'swap', variable: '--font-inter', fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'] });
const plexArabic = localFont({
  src: [
    { path: './fonts/IBMPlexSansArabic-Regular.ttf', weight: '400' },
    { path: './fonts/IBMPlexSansArabic-Medium.ttf', weight: '500' },
    { path: './fonts/IBMPlexSansArabic-SemiBold.ttf', weight: '600' },
    { path: './fonts/IBMPlexSansArabic-Bold.ttf', weight: '700' },
  ],
  display: 'swap', variable: '--font-plex-arabic', fallback: ['Noto Sans Arabic', 'Segoe UI', 'system-ui', 'sans-serif'],
});
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
