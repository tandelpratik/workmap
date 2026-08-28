import { sourceDescriptors } from '@/config/sources';
import { getDatabase } from './client';

// Standalone scripts do not get the .env loading that Next performs, and
// environment variables are read lazily, so loading here is early enough.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file. Variables may still come from the shell or the platform.
}

/**
 * Database seed.
 *
 * Seeds the source registry and nothing else. That is a deliberate limit:
 *
 *   - Geography and occupation reference data comes from ABS releases whose
 *     licence is not yet verified, and committing it now would put unverified
 *     third-party data in the repository.
 *   - Job listings would be fabricated. Development fixtures arrive at
 *     milestone 13, behind the synthetic source, and are never seeded into a
 *     shared database by default.
 *
 * So this seed writes only data the project itself owns: which sources exist
 * and what state each is in.
 *
 * Idempotent by upsert, so running it repeatedly is safe.
 */
export async function seed(): Promise<{ created: number; updated: number }> {
  const database = getDatabase();
  if (!database.ok) {
    throw new Error(
      `Cannot seed: ${database.error.message} Set DATABASE_URL and try again.`,
    );
  }

  const prisma = database.value;
  let created = 0;
  let updated = 0;

  for (const descriptor of sourceDescriptors) {
    const existing = await prisma.source.findUnique({ where: { key: descriptor.key } });

    const data = {
      displayName: descriptor.displayName,
      kind: descriptor.kind,
      activation: descriptor.activation,
      complianceStatus: descriptor.complianceStatus,
      attributionRequired: descriptor.attributionRequired,
      attributionText: descriptor.attributionText ?? null,
      termsUrl: descriptor.termsUrl ?? null,
      methodologyUrl: descriptor.methodologyUrl ?? null,
      homepageUrl: descriptor.homepageUrl ?? null,
      rateLimitRequests: descriptor.rateLimit?.requests ?? null,
      rateLimitPerSecond: descriptor.rateLimit?.perSeconds ?? null,
      notes: descriptor.notes ?? null,
    };

    await prisma.source.upsert({
      where: { key: descriptor.key },
      create: { key: descriptor.key, ...data },
      update: data,
    });

    if (existing) updated += 1;
    else created += 1;
  }

  return { created, updated };
}

// Executed directly by `npm run db:seed`.
if (process.argv[1]?.includes('seed')) {
  seed()
    .then(({ created, updated }) => {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          level: 'info',
          message: 'Seed complete',
          sourcesCreated: created,
          sourcesUpdated: updated,
        }),
      );
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
