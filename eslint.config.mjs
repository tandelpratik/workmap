import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * Architectural import boundaries (ADR-0001).
 *
 * Dependencies point inward. The domain is the centre and imports no outer
 * module. These rules are the enforcement mechanism for that decision: without
 * them ADR-0001 is a convention, and conventions decay.
 *
 * Each entry lists what a directory may NOT import.
 */
const boundaries = [
  {
    name: 'domain',
    files: ['domain/**/*.ts'],
    forbid: ['@/integrations/*', '@/ingestion/*', '@/db/*', '@/app/*', '@/components/*'],
    reason:
      'domain/ is the centre of the dependency graph. It must not know that providers, ' +
      'persistence or the web layer exist. See docs/adr/0001-provider-neutral-domain.md',
  },
  {
    name: 'components',
    files: ['components/**/*.{ts,tsx}'],
    forbid: ['@/db/*', '@/integrations/*', '@/ingestion/*', '@/analytics/*'],
    reason:
      'components/ renders data it is given. It must not query the database or call a ' +
      'provider. Data reaches it through app/ or the API layer.',
  },
  {
    name: 'integrations',
    files: ['integrations/**/*.ts'],
    forbid: ['@/app/*', '@/components/*', '@/analytics/*', '@/search/*'],
    reason:
      'integrations/ translates one provider into domain contracts. It must not reach ' +
      'into the web layer or analytics.',
  },
  {
    name: 'lib',
    files: ['lib/**/*.ts'],
    forbid: ['@/app/*', '@/components/*', '@/db/*', '@/integrations/*', '@/domain/*'],
    reason: 'lib/ holds framework-neutral utilities and must stay dependency-free.',
  },
];

const boundaryConfigs = boundaries.map(({ files, forbid, reason }) => ({
  files,
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [{ group: forbid, message: reason }],
      },
    ],
  },
}));

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'coverage/**',
      'next-env.d.ts',
      'db/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextCoreWebVitals,

  {
    rules: {
      // Unused variables are an error, with an explicit underscore escape hatch
      // for intentionally ignored bindings.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Secrets and untrusted content must not be logged ad hoc. Use the
      // redacting logger in lib/logger.ts (ADR-0008).
      'no-console': ['error', { allow: ['error'] }],

      // Explicit any defeats the validation boundaries in ADR-0008.
      '@typescript-eslint/no-explicit-any': 'error',

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  ...boundaryConfigs,

  {
    // The logger is the one place permitted to write to the console, and
    // config/env.ts must report fatal misconfiguration before a logger exists.
    files: ['lib/logger.ts', 'config/env.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    files: ['tests/**/*.ts', '**/*.test.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    // Build scripts run outside the application, before a logger exists, and
    // their stdout is the build log itself. The operational scripts in
    // scripts/*.ts are deliberately not included: they opt in per line, which
    // keeps the friction where ad hoc logging would actually be a mistake.
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
);
