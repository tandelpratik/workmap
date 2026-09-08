import { describe, expect, it } from 'vitest';
import { __testing } from '@/lib/logger';

const { redact, redactString } = __testing;

describe('log redaction (ADR-0008)', () => {
  it('redacts credentials embedded in a connection string', () => {
    const output = redactString(
      'connecting to postgresql://admin:hunter2@db.example/app',
    );
    expect(output).not.toContain('hunter2');
    expect(output).not.toContain('admin');
    expect(output).toContain('postgresql://');
  });

  it('redacts a bearer token', () => {
    const output = redactString('Authorization: Bearer abcdef1234567890abcdef');
    expect(output).not.toContain('abcdef1234567890abcdef');
    expect(output).toContain('Bearer');
  });

  it('redacts by field name regardless of value', () => {
    const output = redact({
      appId: 'public-looking',
      apiKey: 'k-123',
      password: 'pw',
      operationsSecret: 's',
      authorization: 'a',
      databaseUrl: 'postgresql://u:p@h/d',
      occupation: 'Business Analyst',
    }) as Record<string, unknown>;

    expect(output['apiKey']).toBe('[redacted]');
    expect(output['password']).toBe('[redacted]');
    expect(output['operationsSecret']).toBe('[redacted]');
    expect(output['authorization']).toBe('[redacted]');
    expect(output['databaseUrl']).toBe('[redacted]');
    expect(output['appId']).toBe('[redacted]');

    // Ordinary operational context must survive, or logs become useless.
    expect(output['occupation']).toBe('Business Analyst');
  });

  /*
   * Both directions, because the `pass` branch is tuned and a later edit could
   * loosen it too far or tighten it back to matching any word containing
   * "pass". The second list is not cosmetic: a data quality report logging
   * `passed` came back redacted, which is what prompted the lookahead.
   */
  it('redacts every form of a passphrase or passcode', () => {
    const output = redact({
      password: 'a',
      passwd: 'b',
      passphrase: 'c',
      passcode: 'd',
      passkey: 'e',
      userPass: 'f',
    }) as Record<string, unknown>;

    for (const key of Object.keys(output)) {
      expect(output[key], `${key} should be redacted`).toBe('[redacted]');
    }
  });

  it('leaves ordinary words that merely contain "pass" alone', () => {
    const output = redact({
      passed: 14,
      passes: 3,
      bypassed: false,
      passenger: 'name',
    }) as Record<string, unknown>;

    expect(output['passed']).toBe(14);
    expect(output['passes']).toBe(3);
    expect(output['bypassed']).toBe(false);
    expect(output['passenger']).toBe('name');
  });

  it('redacts inside nested structures', () => {
    const output = redact({
      run: { source: 'jsa-ivi', config: { secret: 'value' } },
    }) as { run: { config: { secret: string }; source: string } };

    expect(output.run.config.secret).toBe('[redacted]');
    expect(output.run.source).toBe('jsa-ivi');
  });

  it('reduces an error to name and message, dropping the stack', () => {
    const output = redact(new Error('failed for postgresql://u:pw@h/d')) as {
      name: string;
      message: string;
      stack?: string;
    };

    expect(output.name).toBe('Error');
    expect(output.stack).toBeUndefined();
    expect(output.message).not.toContain('pw');
  });

  it('stops recursing on deeply nested input', () => {
    let nested: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 20; i += 1) nested = { nested };

    expect(() => redact(nested)).not.toThrow();
    expect(JSON.stringify(redact(nested))).toContain('[truncated]');
  });

  it('caps array length so one payload cannot flood the log', () => {
    const output = redact(Array.from({ length: 500 }, (_, i) => i)) as unknown[];
    expect(output.length).toBe(50);
  });
});
