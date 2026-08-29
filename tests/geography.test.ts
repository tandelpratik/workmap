import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  geographyLevels,
  isMappable,
  parentLevelOf,
  summarise,
  validateHierarchy,
  type GeographyLevel,
} from '@/domain/geography';
import {
  countByEdition,
  findByCode,
  listByLevel,
  listChildren,
} from '@/db/repositories/geography';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Database sections skip.
}

const withDatabase = describe.skipIf(!process.env['DATABASE_URL']);

const EDITION = 'ASGS2026';
const root = join(import.meta.dirname, '..');

interface RegistryEntry {
  code: string;
  name: string;
  level: GeographyLevel;
  parentCode: string | null;
  hasGeometry: boolean;
  areaSqKm: number | null;
  changeSincePreviousEdition: string | null;
}

const registry: RegistryEntry[] = JSON.parse(
  readFileSync(join(root, 'data', 'geography', `registry-${EDITION}.json`), 'utf8'),
);

function area(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    code: 'X',
    name: 'X',
    level: 'SA4',
    parentCode: '1',
    hasGeometry: true,
    areaSqKm: 1,
    changeSincePreviousEdition: 'No change',
    ...overrides,
  };
}

describe('hierarchy rules', () => {
  it('knows the parent of each level', () => {
    expect(parentLevelOf('COUNTRY')).toBeNull();
    expect(parentLevelOf('STATE')).toBe('COUNTRY');
    expect(parentLevelOf('SA4')).toBe('STATE');
  });

  it('accepts a well-formed hierarchy', () => {
    expect(
      validateHierarchy([
        area({ code: 'AUS', level: 'COUNTRY', parentCode: null }),
        area({ code: '1', level: 'STATE', parentCode: 'AUS' }),
        area({ code: '101', level: 'SA4', parentCode: '1' }),
      ]),
    ).toEqual([]);
  });

  it('rejects a duplicate code within one level', () => {
    const problems = validateHierarchy([
      area({ code: 'AUS', level: 'COUNTRY', parentCode: null }),
      area({ code: '1', level: 'STATE', parentCode: 'AUS' }),
      area({ code: '1', level: 'STATE', parentCode: 'AUS' }),
    ]);
    expect(problems.map((p) => p.problem)).toContain('Duplicate code within its level.');
  });

  it('allows the same code at different levels', () => {
    // ASGS does this: "ZZZ" is both a COUNTRY and an SA4. Treating codes as
    // globally unique silently destroyed a row before this was understood.
    expect(
      validateHierarchy([
        area({ code: 'ZZZ', level: 'COUNTRY', parentCode: null }),
        area({ code: 'Z', level: 'STATE', parentCode: 'ZZZ' }),
        area({ code: 'ZZZ', level: 'SA4', parentCode: 'Z' }),
      ]),
    ).toEqual([]);
  });

  it('rejects an area whose parent is absent', () => {
    const problems = validateHierarchy([area({ code: '101', parentCode: 'missing' })]);
    expect(problems[0]?.problem).toMatch(/not present in the registry/);
  });

  it('rejects an area with no parent below the root', () => {
    const problems = validateHierarchy([area({ code: '101', parentCode: null })]);
    expect(problems[0]?.problem).toMatch(/Missing parent/);
  });

  it('rejects a root with a parent', () => {
    const problems = validateHierarchy([
      area({ code: 'AUS', level: 'COUNTRY', parentCode: 'something' }),
    ]);
    expect(problems[0]?.problem).toMatch(/must not have a parent/);
  });

  it('requires a parent at the correct level', () => {
    // An SA4 parented to a country rather than a state.
    const problems = validateHierarchy([
      area({ code: 'AUS', level: 'COUNTRY', parentCode: null }),
      area({ code: '101', level: 'SA4', parentCode: 'AUS' }),
    ]);
    expect(problems[0]?.problem).toMatch(/Parent STATE/);
  });
});

describe('mappability', () => {
  it('separates an area that cannot be drawn from one that can', () => {
    expect(isMappable({ hasGeometry: true })).toBe(true);
    expect(isMappable({ hasGeometry: false })).toBe(false);
  });

  it('summarises totals and mappable counts per level', () => {
    const summary = summarise([
      { level: 'SA4', hasGeometry: true },
      { level: 'SA4', hasGeometry: false },
      { level: 'STATE', hasGeometry: true },
    ]);
    expect(summary.SA4).toEqual({ total: 2, mappable: 1 });
    expect(summary.STATE).toEqual({ total: 1, mappable: 1 });
    expect(summary.COUNTRY).toEqual({ total: 0, mappable: 0 });
  });
});

describe('committed registry artefact', () => {
  it('is structurally valid', () => {
    expect(validateHierarchy(registry)).toEqual([]);
  });

  it('uses only known levels', () => {
    for (const entry of registry) expect(geographyLevels).toContain(entry.level);
  });

  it('contains codes reused across levels, which the schema must tolerate', () => {
    const levelsByCode = new Map<string, Set<string>>();
    for (const entry of registry) {
      const levels = levelsByCode.get(entry.code) ?? new Set<string>();
      levels.add(entry.level);
      levelsByCode.set(entry.code, levels);
    }
    const reused = [...levelsByCode.entries()].filter(([, levels]) => levels.size > 1);

    // Regression guard. If this ever becomes empty the fixture has changed and
    // the (code, level, edition) key is no longer exercised by real data.
    expect(reused.length).toBeGreaterThan(0);
    expect(reused.map(([code]) => code)).toContain('ZZZ');
  });

  it('records areas that have no boundary rather than dropping them', () => {
    const unmappable = registry.filter((entry) => !entry.hasGeometry);
    // Offshore, migratory, no usual address and outside Australia. Sources
    // report against these, so they must exist as codes.
    expect(unmappable.length).toBeGreaterThan(0);
    for (const entry of unmappable) {
      expect(entry.areaSqKm === null || entry.areaSqKm === 0).toBe(true);
    }
  });

  it('never carries an area without a name', () => {
    for (const entry of registry) {
      expect(entry.code.length).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });
});

describe('compatibility with the previous ASGS edition', () => {
  // JSA publishes the IVI against an ASGS edition we cannot read from here.
  // It does not matter, provided no code or boundary moved between editions:
  // a series keyed by SA4 code then joins to this registry unchanged. The ABS
  // states what moved, and these tests hold that claim to account.
  const manifest = JSON.parse(
    readFileSync(join(root, 'data', 'geography', `manifest-${EDITION}.json`), 'utf8'),
  ) as {
    editionCompatibility: {
      previousEdition: string;
      changesByLevel: Record<string, Record<string, number>>;
    };
  };

  it('records what the source says changed since the previous edition', () => {
    expect(manifest.editionCompatibility.previousEdition).toMatch(/ASGS2021/);
    expect(Object.keys(manifest.editionCompatibility.changesByLevel).sort()).toEqual([
      'COUNTRY',
      'SA4',
      'STATE',
    ]);
  });

  it('has no code or boundary change at any level, so older data joins safely', () => {
    // Anything beyond a name change means an area was added, removed, split,
    // merged or redrawn. Joining an older series by code would then attach a
    // figure to the wrong place, which is mislabelling geography.
    const benign = new Set(['No change', 'Name change']);
    const offending: string[] = [];

    for (const [level, labels] of Object.entries(
      manifest.editionCompatibility.changesByLevel,
    )) {
      for (const label of Object.keys(labels)) {
        if (!benign.has(label)) offending.push(`${level}: ${label}`);
      }
    }

    expect(
      offending,
      'A code or boundary changed between editions. Joining data published ' +
        'against the older edition is no longer safe and needs an explicit ' +
        'mapping. See docs/compliance/SOURCE_REGISTER.md',
    ).toEqual([]);
  });

  it('confines name changes to areas that cannot be mapped', () => {
    // The four differences are punctuation on offshore and no-usual-address
    // areas. They carry no geometry, so nothing is drawn differently, and we
    // join by code rather than by name in any case.
    const renamed = registry.filter(
      (entry) => entry.changeSincePreviousEdition === 'Name change',
    );
    for (const entry of renamed) expect(entry.hasGeometry).toBe(false);
  });
});

describe('display geometry artefacts', () => {
  const overviewPath = join(
    root,
    'public',
    'geography',
    `sa4-overview-${EDITION}.topo.json`,
  );

  function featureIds(path: string): Set<string> {
    const topology = JSON.parse(readFileSync(path, 'utf8')) as {
      objects: Record<string, { geometries?: { id?: string | number }[] }>;
    };
    const ids = new Set<string>();
    for (const object of Object.values(topology.objects)) {
      for (const geometry of object.geometries ?? []) {
        if (geometry.id !== undefined) ids.add(String(geometry.id));
      }
    }
    return ids;
  }

  it('draws every SA4 that has a boundary', () => {
    const drawn = featureIds(overviewPath);
    const expected = registry
      .filter((entry) => entry.level === 'SA4' && entry.hasGeometry)
      .map((entry) => entry.code);

    // Simplification must not quietly delete an area, which would leave a hole
    // in the map with no error anywhere.
    const missing = expected.filter((code) => !drawn.has(code));
    expect(missing, `simplification dropped: ${missing.join(', ')}`).toEqual([]);
  });

  it('never draws an area that has no boundary', () => {
    const drawn = featureIds(overviewPath);
    const unmappable = registry
      .filter((entry) => entry.level === 'SA4' && !entry.hasGeometry)
      .map((entry) => entry.code);

    // Giving these a shape would be inventing geography.
    for (const code of unmappable) expect(drawn.has(code)).toBe(false);
  });

  it('ships the licence attribution beside the redistributed boundaries', () => {
    // CC BY 4.0 requires attribution to travel with redistributed material.
    // These files are served publicly, so the notice must be next to them and
    // must match what the source registry recorded.
    const notice = readFileSync(
      join(root, 'public', 'geography', 'ATTRIBUTION.txt'),
      'utf8',
    );
    expect(notice).toContain('Australian Bureau of Statistics');
    expect(notice).toContain('CC BY 4.0');
    // Simplification is a modification, and CC BY 4.0 requires that be stated.
    expect(notice).toMatch(/simplified/i);
  });

  it('keeps the national overview within a sensible transfer budget', () => {
    const raw = readFileSync(overviewPath);
    const gzipped = gzipSync(raw).byteLength;
    // Served compressed. A national view above this is too heavy for a free
    // tier and for a mobile connection.
    expect(gzipped).toBeLessThan(80 * 1024);
    expect(statSync(overviewPath).size).toBeGreaterThan(0);
  });
});

withDatabase('geography repository', () => {
  it('has imported every registry record', async () => {
    const count = await countByEdition(EDITION);
    expect(count.ok).toBe(true);
    if (count.ok) expect(count.value).toBe(registry.length);
  });

  it('returns domain types, not persistence rows', async () => {
    const states = await listByLevel(EDITION, 'STATE');
    expect(states.ok).toBe(true);
    if (!states.ok) return;

    const first = states.value[0];
    expect(first).toBeDefined();
    // areaSqKm must be a plain number: a Prisma Decimal leaking into the domain
    // is the coupling the repository boundary exists to prevent.
    if (first?.areaSqKm !== null && first?.areaSqKm !== undefined) {
      expect(typeof first.areaSqKm).toBe('number');
    }
    expect(first).toHaveProperty('edition', EDITION);
  });

  it('distinguishes the same code at different levels', async () => {
    const country = await findByCode(EDITION, 'COUNTRY', 'ZZZ');
    const sa4 = await findByCode(EDITION, 'SA4', 'ZZZ');

    expect(country.ok).toBe(true);
    expect(sa4.ok).toBe(true);
    if (country.ok && sa4.ok) {
      expect(country.value.level).toBe('COUNTRY');
      expect(sa4.value.level).toBe('SA4');
      expect(country.value.id).not.toBe(sa4.value.id);
    }
  });

  it('reports a missing area as not found rather than as an empty result', async () => {
    const result = await findByCode(EDITION, 'SA4', 'does-not-exist');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('resolves children through the hierarchy', async () => {
    const children = await listChildren(EDITION, '1');
    expect(children.ok).toBe(true);
    if (!children.ok) return;

    const expected = registry.filter(
      (entry) => entry.parentCode === '1' && entry.level === 'SA4',
    );
    expect(children.value.length).toBe(expected.length);
    for (const child of children.value) expect(child.parentCode).toBe('1');
  });

  it('preserves the unmappable areas through the import', async () => {
    const sa4 = await listByLevel(EDITION, 'SA4');
    expect(sa4.ok).toBe(true);
    if (!sa4.ok) return;

    const unmappable = sa4.value.filter((entry) => !entry.hasGeometry);
    const expected = registry.filter((e) => e.level === 'SA4' && !e.hasGeometry);
    expect(unmappable.length).toBe(expected.length);
  });
});
