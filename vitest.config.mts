import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],

    // Unit tests do not read the developer's .env; each supplies the
    // environment it needs. The database tests load it explicitly, because
    // they need a real connection.

    // Database tests run against Neon in ap-southeast-2. A round trip from a
    // development machine outside that region is a few hundred milliseconds,
    // and a single test makes several, so the 5s default is too tight. This is
    // local latency only: in production the app runs in the same region.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
