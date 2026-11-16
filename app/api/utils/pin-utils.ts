import crypto from 'crypto';
import { hashPasswordSync, verifyPasswordSync } from './password-utils';

const PIN_HASH_PREFIX = 'pbkdf2$';

/**
 * Hash a security PIN for storage (PBKDF2, random salt, prefixed so hashed
 * values are recognizable).
 */
export function hashPin(pin: string): string {
  return PIN_HASH_PREFIX + hashPasswordSync(pin);
}

export function isHashedPin(stored: string): boolean {
  return stored.startsWith(PIN_HASH_PREFIX);
}

/**
 * Verify a PIN against the stored value. Hashed values go through PBKDF2 with
 * timingSafeEqual; legacy plaintext values (pre-hashing installs) are compared
 * in constant time and can be re-hashed by the caller via isHashedPin().
 */
export function verifyPin(pin: string, stored: string): boolean {
  if (!pin || !stored) return false;
  if (isHashedPin(stored)) {
    return verifyPasswordSync(pin, stored.slice(PIN_HASH_PREFIX.length));
  }
  const a = Buffer.from(pin);
  const b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
