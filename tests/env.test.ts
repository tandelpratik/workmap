import { describe, expect, it } from 'vitest';
import { EnvironmentError, parseEnv } from '@/config/env';

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
