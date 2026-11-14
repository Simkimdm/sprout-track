import { describe, expect, it } from 'vitest';
import { generateSecurityPin } from '../app/api/utils/security-pin';

describe('generateSecurityPin', () => {
  it('returns a 6-digit numeric string', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateSecurityPin()).toMatch(/^\d{6}$/);
    }
  });

  it('is not constant (no hardcoded default)', () => {
    const pins = new Set(Array.from({ length: 50 }, () => generateSecurityPin()));
    expect(pins.size).toBeGreaterThan(1);
  });
});
