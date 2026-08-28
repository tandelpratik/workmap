import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono, Source_Serif_4 } from 'next/font/google';
import { brand } from '@/config/brand';
import './globals.css';

/**
 * Fonts per the design system: IBM Plex Sans for interface and data, Source
 * Serif 4 for editorial display. Loaded through next/font so they are
 * self-hosted, preloaded and free of a render-blocking third-party request.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-plex-mono',
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-source-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: `${brand.productName}: ${brand.tagline}`,
    template: `%s | ${brand.productName}`,
  },
  description: brand.description,
  applicationName: brand.productName,
  openGraph: {
    title: brand.social.title,
    description: brand.social.description,
    type: 'website',
    locale: brand.locale.replace('-', '_'),
    ...(brand.social.imagePath ? { images: [brand.social.imagePath] } : {}),
  },
  // The product is not ready to be indexed. Removed at milestone 27.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={brand.locale}
      className={`${plexSans.variable} ${plexMono.variable} ${sourceSerif.variable}`}
    >
      <body className="min-h-dvh">
        <a
          href="#main"
          className="focus:bg-paper-raised focus:text-ink sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
