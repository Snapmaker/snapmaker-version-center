import { describe, it, expect } from 'vitest';
import { resolveUnit } from '../src/units';

describe('resolveUnit', () => {
  it('maps firmware paths', () => {
    expect(resolveUnit('/upgrade/firmware/a400/version.json')).toBe('firmware/a400');
    expect(resolveUnit('/upgrade/firmware/j1/version.json')).toBe('firmware/j1');
    expect(resolveUnit('/upgrade/firmware/fabscreen/version.json')).toBe('firmware/fabscreen');
  });

  it('maps app paths', () => {
    expect(resolveUnit('/upgrade/app/android/version.json')).toBe('app/android');
    expect(resolveUnit('/upgrade/app/ios/version.json')).toBe('app/ios');
    expect(resolveUnit('/upgrade/app/harmonyOS/version.json')).toBe('app/harmonyOS');
  });

  it('maps orca paths ignoring locale', () => {
    expect(resolveUnit('/upgrade/orca/win/en/version.json')).toBe('orca/win');
    expect(resolveUnit('/upgrade/orca/mac/zh_CN/version.json')).toBe('orca/mac');
  });

  it('maps flutter and profile paths', () => {
    expect(resolveUnit('/upgrade/flutter/en/version.json')).toBe('flutter');
    expect(resolveUnit('/upgrade/profile/zh_CN/version.json')).toBe('profile');
  });

  it('returns null for non-version.json or unknown paths', () => {
    expect(resolveUnit('/upgrade/firmware/a400/version_cn.json')).toBeNull();
    expect(resolveUnit('/upgrade/orca/linux/README.txt')).toBeNull();
    expect(resolveUnit('/upgrade/unknown/x/version.json')).toBeNull();
    expect(resolveUnit('/config/domain.json')).toBeNull();
  });
});
