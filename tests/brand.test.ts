import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { brand } from '@/config/brand';

const root = join(import.meta.dirname, '..');

/** Directories holding first-party source that must stay brand-free. */
const sourceDirs = [
  'app',
  'components',
  'config',
  'db',
  'domain',
  'integrations',
  'ingestion',
  'analytics',
  'geography',
  'search',
  'skills',
  'salary',
  'lib',
  'types',
  'scripts',
];

/**
 * The brand may appear here and nowhere else in source (ADR-0007). Content
 * files and public assets are also permitted, and get added to this list when
 * they exist.
 */
const brandAllowed = [join('config', 'brand.ts')];

const skipDirs = new Set(['generated', 'node_modules', '.next']);

function sourceFiles(dir: string): string[] {
  const absolute = join(root, dir);
  let entries: string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    if (skipDirs.has(entry)) return [];
    const full = join(absolute, entry);
    if (statSync(full).isDirectory()) return sourceFiles(join(dir, entry));
    return /\.(ts|tsx)$/.test(entry) ? [join(dir, entry)] : [];
  });
}

describe('brand configuration', () => {
  it('validates at module load', () => {
    expect(brand.productName).toBeTruthy();
    expect(brand.tagline).toBeTruthy();
    expect(brand.locale).toBe('en-AU');
  });

  it('leaves unassigned values null rather than inventing them', () => {
    // A placeholder contact address or legal name would be fabricated data in a
    // product whose constitution forbids exactly that. Both appear in legal
    // text, where a wrong value is worse than an absent one.
    expect(brand.contactEmail).toBeNull();
    expect(brand.legalName).toBeNull();
  });

  it('states the domain as a bare host, or not at all', () => {
    /*
     * The domain stopped being null when one was registered, so the guard has
     * to change shape rather than disappear. What it protects is the same
     * thing: that the value is a real assignment and not a stand-in. A
     * placeholder host would be fabricated data, and a value carrying a
     * protocol or a path would silently break the metadata base built from it.
     */
    if (brand.domain === null) return;

    expect(brand.domain).not.toMatch(/^https?:/);
    expect(brand.domain).not.toContain('/');
    expect(brand.domain).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);

    const placeholders = ['example', 'localhost', 'test', 'tbd', 'changeme'];
    for (const placeholder of placeholders) {
      expect(brand.domain.toLowerCase()).not.toContain(placeholder);
    }
  });
});

describe('brand is not a technical namespace (ADR-0007)', () => {
  it('does not appear in source outside the brand configuration', () => {
    const offenders = sourceDirs
      .flatMap(sourceFiles)
      .filter((file) => !brandAllowed.includes(file))
      .filter((file) =>
        readFileSync(join(root, file), 'utf8').includes(brand.productName),
      )
      .map((file) => relative('.', file).split(sep).join('/'));

    expect(
      offenders,
      `The brand name must live only in config/brand.ts so a rename stays a ` +
        `configuration change. Found it in: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('does not appear in the package name', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      name: string;
    };
    expect(pkg.name.toLowerCase()).not.toContain(brand.productName.toLowerCase());
  });
});
