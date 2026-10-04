import type { Metadata, Viewport } from 'next';
import { Outfit, Nunito } from 'next/font/google';
import './globals.css';

// Self-hosted at build time, so production never depends on a font CDN at runtime.
const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-outfit', display: 'swap' });
const nunito = Nunito({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-nunito', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'LS Command', template: '%s · LS Command' },
  description: "LS Command: Lucid Studio's operating command center.",
  applicationName: 'LS Command',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0d51',
};

// Applies a saved theme before paint so the page never flashes the wrong one.
const themeScript = `try{var t=localStorage.getItem('ls-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${nunito.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
