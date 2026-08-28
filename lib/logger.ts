/**
 * Structured logging with enforced redaction (ADR-0008).
 *
 * Redaction happens inside the logger rather than at each call site. A rule
 * that depends on every caller remembering it will eventually be forgotten,
 * and the consequence here is a credential in a log aggregator.
 *
 * The log level is read straight from process.env rather than through the
 * validated environment, so that a configuration failure can still be reported.
 * Requiring valid configuration in order to report invalid configuration would
 * be a bootstrap cycle.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED = '[redacted]';

/** Field names whose values are never logged, matched case-insensitively. */
const sensitiveKeyPattern =
  /(pass(word)?|secret|token|api[-_]?key|credential|authorization|auth|cookie|session|dsn|connection[-_]?string|database[-_]?url|app[-_]?id)/i;

/** A URL carrying inline credentials, for example postgres://user:pw@host/db. */
const credentialUrlPattern = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/gi;

/** Long opaque strings that are probably keys rather than prose. */
const bearerPattern = /\b(bearer\s+)[A-Za-z0-9._-]{16,}/gi;

function redactString(value: string): string {
  return value
    .replace(credentialUrlPattern, (match) => `${match.split('://')[0]}://${REDACTED}@`)
    .replace(bearerPattern, (_match, prefix: string) => `${prefix}${REDACTED}`);
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';

  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      // Stack traces stay out of structured fields. They are useful locally and
      // are noise, and occasionally a leak, in aggregated logs.
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = sensitiveKeyPattern.test(key) ? REDACTED : redact(item, depth + 1);
  }
  return output;
}

function currentLevel(): LogLevel {
  const raw = process.env['LOG_LEVEL'];
  return raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error'
    ? raw
    : 'info';
}

export interface LogContext {
  /** Ties a log entry to a user-visible failure. */
  correlationId?: string;
  [key: string]: unknown;
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  if (levelRank[level] < levelRank[currentLevel()]) return;

  const entry = {
    level,
    time: new Date().toISOString(),
    message: redactString(message),
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };

  // One JSON object per line, so platform log collectors can parse it.
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
};

/** Exported for tests, so redaction rules are verifiable. */
export const __testing = { redact, redactString };
