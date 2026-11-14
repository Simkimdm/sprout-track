import crypto from 'crypto';

/**
 * Generates a random 6-digit security PIN.
 * Used instead of a hardcoded default ("111222") so a fresh installation is
 * never protected by a publicly known PIN.
 */
export function generateSecurityPin(): string {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}
