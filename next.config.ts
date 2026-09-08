import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 *
 * Third-party job descriptions are untrusted content (ADR-0008), so the browser
 * is told to be strict about what it will execute, where it will send referrer
 * information, and which origins it may talk to at all. The last of those is the
 * content security policy below.
 *
 * It is worth having here because this site is unusually easy to lock down: it
 * loads no third-party script, no third-party stylesheet, no analytics, no
 * embedded frame and no remote font. Everything comes from this origin, so the
 * policy can say exactly that.
 *
 * `'unsafe-inline'` on scripts is the one concession and it is a real one. Next
 * bootstraps hydration and streams its payload through inline script elements,
 * and removing the concession means issuing a nonce per request from middleware,
 * which is a request-time cost on every page of a site that otherwise renders
 * almost everything statically. The trade is deliberate: what remains blocked is
 * loading or connecting to any other origin, which is the half of an injection
 * that exfiltrates something.
 *
 * `form-action` and `base-uri` matter more than they look. Every form here is a
 * GET to a route on this origin, and a base tag is how an injection quietly
 * repoints every relative URL on a page.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Kept alongside frame-ancestors, which supersedes it, because it is one
  // header and there are still browsers that read only the older one.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  /*
   * Two years, subdomains included. The host terminates TLS and sets this
   * itself in most configurations; stating it here means the guarantee travels
   * with the application rather than with wherever it happens to be deployed.
   * Deliberately without preload, which is a submission that is hard to undo.
   */
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * The map reads its boundary topology from `public/geography` at request
   * time with `fs`, which the bundler cannot see. Without this the files are
   * absent from the serverless bundle and the map fails in production while
   * working perfectly in development.
   */
  outputFileTracingIncludes: {
    // Both tiers. The detail files live in a subdirectory, and a pattern that
    // matched only the top level would leave the drilldown working in
    // development and failing in production, which is the exact failure this
    // setting exists to prevent.
    '/map': [
      './public/geography/*.topo.json',
      './public/geography/sa4-detail-*/*.topo.json',
    ],
  },

  typescript: {
    // Type errors must fail the build. Never set this to true.
    ignoreBuildErrors: false,
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
