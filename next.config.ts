import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 *
 * Third-party job descriptions are untrusted content (ADR-0008), so the
 * browser is told to be strict about what it will execute and where it will
 * send referrer information.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
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
    '/map': ['./public/geography/*.topo.json'],
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
