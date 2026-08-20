import { describe, it, expect } from 'vitest';
import { bucket, isEligible } from '../src/rollout';
import type { ProductRollout } from '../src/types';

describe('bucket', () => {
  it('is deterministic for the same serial', async () => {
    expect(await bucket('A400-DEV-0001')).toBe(await bucket('A400-DEV-0001'));
  });

  it('returns a value in [0, 99]', async () => {
    for (const sn of ['A', 'B', 'C', 'abc123', 'xyz-999']) {
      const v = await bucket(sn);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(99);
    }
  });
});

describe('isEligible', () => {
  const base: ProductRollout = { percent: 5 };

  it('whitelist wins over percent', () => {
    expect(isEligible({ ...base, whitelist: ['SN-X'] }, 'SN-X', 99)).toBe(true);
  });

  it('prefix wins over percent', () => {
    expect(isEligible({ ...base, sn_prefix: ['BETA-'] }, 'BETA-001', 99)).toBe(true);
  });

  it('falls back to percent bucketing', () => {
    expect(isEligible(base, 'SN-Y', 3)).toBe(true);
    expect(isEligible(base, 'SN-Y', 7)).toBe(false);
  });

  it('percent 0 → nobody (rollback)', () => {
    expect(isEligible({ percent: 0 }, 'SN-Y', 0)).toBe(false);
  });

  it('percent 100 → everyone', () => {
    expect(isEligible({ percent: 100 }, 'SN-Y', 99)).toBe(true);
  });
});
