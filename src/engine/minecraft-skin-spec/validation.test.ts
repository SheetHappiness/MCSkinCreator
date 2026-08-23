import { describe, expect, it } from 'vitest';

import {
  SKIN_MODELS,
  auditCanonicalRegions,
  collectCanonicalRegions,
  validateSkinSpecification,
  validateTextureRegion,
} from '.';

describe('texture-region validation', () => {
  it('accepts integer positive half-open regions inside 64x64', () => {
    expect(
      validateTextureRegion({ x: 60, y: 52, width: 4, height: 12 }),
    ).toEqual([]);
  });

  it.each([
    [{ x: 0.5, y: 0, width: 4, height: 4 }, 'integers'],
    [{ x: 0, y: 0, width: 0, height: 4 }, 'positive'],
    [{ x: -1, y: 0, width: 4, height: 4 }, 'inside'],
    [{ x: 63, y: 63, width: 2, height: 2 }, 'inside'],
  ] as const)('rejects %o', (region, expectedMessage) => {
    expect(validateTextureRegion(region).join(' ')).toContain(expectedMessage);
  });
});

describe('canonical region coverage and collision audit', () => {
  it('contains 72 valid and non-overlapping regions per model', () => {
    for (const model of SKIN_MODELS) {
      expect(collectCanonicalRegions(model)).toHaveLength(72);
      expect(auditCanonicalRegions(model)).toEqual([]);
    }
  });

  it('passes the complete structural validation', () => {
    expect(validateSkinSpecification()).toEqual([]);
  });
});
