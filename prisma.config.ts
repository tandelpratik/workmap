import { defineConfig } from 'prisma/config';

// Prisma CLI commands run outside Next.js, which would otherwise load .env for
// us. Node's built-in loader avoids adding a dependency for this.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file. Environment variables may still be supplied by the shell or
  // by the deployment platform.
}

const migrationUrl = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'];

export default defineConfig({
  schema: 'db/schema.prisma',
  migrations: {
    // Run after migrations are applied. Seeds the source registry only.
    seed: 'tsx db/seed.ts',
  },
  datasource: {
    // Migrations and introspection use the direct connection, because some DDL
    // does not execute correctly through a connection pooler. The application
    // itself uses the pooled connection; see db/client.ts (ADR-0006).
    ...(migrationUrl ? { url: migrationUrl } : {}),
  },
});
