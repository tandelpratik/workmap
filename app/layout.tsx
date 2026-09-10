import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono, Source_Serif_4 } from 'next/font/google';
import { brand } from '@/config/brand';
import { SiteFooter } from '@/components/layout/site-footer';
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
  /*
   * The base every relative metadata URL resolves against.
   *
   * Built from the configured domain rather than written out, so the rename
   * that changes the domain changes this too (ADR-0007), and omitted entirely
   * while no domain is assigned. Next throws a build error on a relative
   * metadata URL with no base, so the guard is real: a deployment with no
   * domain must keep working, and it does, because nothing here is relative
   * until a social image exists.
   */
  ...(brand.domain === null ? {} : { metadataBase: new URL(`https://${brand.domain}`) }),
  title: {
    default: `${brand.productName}: ${brand.tagline}`,
    template: `%s | ${brand.productName}`,
  },
  description: brand.description,
  applicationName: brand.productName,
  // Read from the brand configuration rather than relying on the framework
  // finding a file by name, so the asset and the config cannot disagree and a
  // rename stays a configuration change (ADR-0007).
  icons: { icon: brand.assets.faviconPath },
  openGraph: {
    title: brand.social.title,
    description: brand.social.description,
    siteName: brand.productName,
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
  /*
   * Both schemes are supported, so the browser is told so rather than being
   * pinned to one. The tokens in globals.css define a warm night edition and
   * the reader's own preference selects it.
   */
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={brand.locale}
      className={`${plexSans.variable} ${plexMono.variable} ${sourceSerif.variable}`}
    >
      {/*
        A flex column so the footer sits at the foot of a short page rather than
        halfway up it. The main region grows; the footer takes its own height.
      */}
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="focus:bg-paper-raised focus:text-ink focus:border-rule-heavy sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:border focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
