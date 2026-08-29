import { describe, expect, it } from 'vitest';
import { inspectEnv, EnvironmentError, parseEnv } from '@/config/env';

const validUrl = 'postgresql://user:pw@host.example:5432/db';

describe('environment validation', () => {
  it('applies safe defaults when nothing is set', () => {
    const env = parseEnv({});
    expect(env.APP_ENV).toBe('development');
    expect(env.ALLOW_SYNTHETIC_SOURCES).toBe(false);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('rejects an unknown APP_ENV', () => {
    expect(() => parseEnv({ APP_ENV: 'staging' })).toThrow(EnvironmentError);
  });

  it('allows a missing database in development', () => {
    expect(() => parseEnv({ APP_ENV: 'development' })).not.toThrow();
  });

  it('requires a database in deployed environments', () => {
    for (const APP_ENV of ['preview', 'production']) {
      expect(() => parseEnv({ APP_ENV })).toThrow(/DATABASE_URL is required/);
    }
  });

  it('rejects a malformed connection string', () => {
    expect(() => parseEnv({ DATABASE_URL: 'not-a-url' })).toThrow(EnvironmentError);
  });

  it('rejects an operations secret that is too short to be useful', () => {
    expect(() => parseEnv({ OPERATIONS_SECRET: 'short' })).toThrow(EnvironmentError);
  });

  it('never includes values in the error message', () => {
    // Failure output goes to logs. A rejected value may itself be a credential,
    // so only field names and messages may appear (ADR-0008).
    try {
      parseEnv({ DATABASE_URL: 'hunter2-is-not-a-url' });
      expect.unreachable('expected a validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentError);
      expect((error as Error).message).not.toContain('hunter2');
    }
  });
});

describe('synthetic source boot gate (ADR-0009)', () => {
  it('refuses to start production with synthetic sources enabled', () => {
    expect(() =>
      parseEnv({
        APP_ENV: 'production',
        DATABASE_URL: validUrl,
        ALLOW_SYNTHETIC_SOURCES: 'true',
      }),
    ).toThrow(/must be false when APP_ENV is "production"/);
  });

  it('allows synthetic sources in development', () => {
    const env = parseEnv({
      APP_ENV: 'development',
      ALLOW_SYNTHETIC_SOURCES: 'true',
    });
    expect(env.ALLOW_SYNTHETIC_SOURCES).toBe(true);
  });

  it('allows synthetic sources in preview, where the UI is reviewed', () => {
    const env = parseEnv({
      APP_ENV: 'preview',
      DATABASE_URL: validUrl,
      ALLOW_SYNTHETIC_SOURCES: 'true',
    });
    expect(env.ALLOW_SYNTHETIC_SOURCES).toBe(true);
  });

  it('starts production normally when synthetic sources are off', () => {
    const env = parseEnv({
      APP_ENV: 'production',
      DATABASE_URL: validUrl,
      ALLOW_SYNTHETIC_SOURCES: 'false',
    });
    expect(env.ALLOW_SYNTHETIC_SOURCES).toBe(false);
  });

  it('treats an unset flag as disabled', () => {
    const env = parseEnv({ APP_ENV: 'production', DATABASE_URL: validUrl });
    expect(env.ALLOW_SYNTHETIC_SOURCES).toBe(false);
  });

  it('rejects a non-boolean flag rather than coercing it', () => {
    // "yes" or "1" must not be silently read as truthy, and more importantly a
    // typo must not be silently read as false in a preview environment.
    expect(() => parseEnv({ ALLOW_SYNTHETIC_SOURCES: 'yes' })).toThrow(EnvironmentError);
  });
});

describe('inspecting an environment without insisting it be valid', () => {
  const valid = {
    APP_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@host.neon.tech/db?sslmode=require',
  };

  it('returns the parsed environment when it is valid', () => {
    const inspection = inspectEnv(valid);
    expect(inspection.ok).toBe(true);
    expect(inspection.ok && inspection.env.APP_ENV).toBe('production');
  });

  it('names the offending variables without returning their values', () => {
    const inspection = inspectEnv({ ...valid, ADZUNA_COUNTRY: 'aus' });
    expect(inspection.ok).toBe(false);
    if (inspection.ok) return;

    expect(inspection.fields).toEqual(['ADZUNA_COUNTRY']);
    // The value is the thing that must never leak: several of these variables
    // are credentials, and this response is returned by an unauthenticated
    // endpoint.
    expect(inspection.issues.join(' ')).not.toContain('aus');
  });

  it('treats an ordinary misconfiguration as degrading, not fatal', () => {
    // The server should start and report it, because refusing to boot takes
    // the health endpoint down with everything else.
    const inspection = inspectEnv({ APP_ENV: 'production' });
    expect(inspection.ok).toBe(false);
    expect(inspection.ok === false && inspection.fields).toContain('DATABASE_URL');
    expect(inspection.ok === false && inspection.fatal).toBe(false);
  });

  it('treats synthetic sources in production as fatal', () => {
    // The one case with no degraded mode: a running server that publishes
    // invented job advertisements is the outcome being prevented (ADR-0009).
    const inspection = inspectEnv({ ...valid, ALLOW_SYNTHETIC_SOURCES: 'true' });
    expect(inspection.ok).toBe(false);
    expect(inspection.ok === false && inspection.fatal).toBe(true);
  });

  it('reports every problem at once, not just the first', () => {
    // Both values are present and wrong. An empty value would not qualify:
    // that is treated as unset, which the block below covers.
    const inspection = inspectEnv({ APP_ENV: 'nonsense', ADZUNA_COUNTRY: 'aus' });
    expect(inspection.ok).toBe(false);
    if (inspection.ok) return;
    expect(inspection.fields).toContain('APP_ENV');
    expect(inspection.fields).toContain('ADZUNA_COUNTRY');
  });
});

describe('an empty variable is treated as unset', () => {
  it('falls back to the default rather than failing a format rule', () => {
    // The production outage this prevents: ADZUNA_COUNTRY was defined and
    // empty, which failed a length rule instead of defaulting, and took every
    // route on the deployment down.
    const env = parseEnv({ ADZUNA_COUNTRY: '' });
    expect(env.ADZUNA_COUNTRY).toBe('au');
  });

  it('applies to optional credentials too', () => {
    const env = parseEnv({ ADZUNA_APP_ID: '', ADZUNA_APP_KEY: '   ' });
    expect(env.ADZUNA_APP_ID).toBeUndefined();
    expect(env.ADZUNA_APP_KEY).toBeUndefined();
  });

  it('still reports a required variable that is empty as missing', () => {
    // Emptiness must not become a way to smuggle past a requirement.
    const inspection = inspectEnv({ APP_ENV: 'production', DATABASE_URL: '' });
    expect(inspection.ok).toBe(false);
    expect(inspection.ok === false && inspection.fields).toContain('DATABASE_URL');
  });

  it('does not let an empty value disarm the synthetic gate', () => {
    const inspection = inspectEnv({
      APP_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@h.example/db',
      ALLOW_SYNTHETIC_SOURCES: 'true',
    });
    expect(inspection.ok === false && inspection.fatal).toBe(true);
  });
});
