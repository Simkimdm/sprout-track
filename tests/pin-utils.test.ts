import { describe, expect, it } from 'vitest';
import { hashPin, isHashedPin, verifyPin } from '../app/api/utils/pin-utils';

describe('pin-utils', () => {
  it('hashPin produces a prefixed, salted hash (not plaintext)', () => {
    const hash = hashPin('123456');
    expect(isHashedPin(hash)).toBe(true);
    expect(hash).not.toContain('123456');
    // same PIN hashes differently each time (random salt)
    expect(hashPin('123456')).not.toBe(hash);
  });

  it('verifyPin accepts the correct PIN against a hash', () => {
    const hash = hashPin('654321');
    expect(verifyPin('654321', hash)).toBe(true);
    expect(verifyPin('000000', hash)).toBe(false);
  });

  it('verifyPin still accepts legacy plaintext PINs (migration path)', () => {
    expect(verifyPin('111222', '111222')).toBe(true);
    expect(verifyPin('111223', '111222')).toBe(false);
    expect(isHashedPin('111222')).toBe(false);
  });

  it('verifyPin rejects empty inputs', () => {
    expect(verifyPin('', '111222')).toBe(false);
    expect(verifyPin('111222', '')).toBe(false);
  });
});
