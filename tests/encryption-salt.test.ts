import { afterEach, describe, expect, it } from 'vitest';
import { encrypt, decrypt } from '../app/api/utils/encryption';

const ENC_HASH = 'ab'.repeat(32);
const ENC_SALT = 'cd'.repeat(32);

describe('encryption per-instance salt', () => {
  afterEach(() => {
    delete process.env.ENC_HASH;
    delete process.env.ENC_SALT;
  });

  it('round-trips with ENC_SALT set', () => {
    process.env.ENC_HASH = ENC_HASH;
    process.env.ENC_SALT = ENC_SALT;
    const enc = encrypt('s3cret-value');
    expect(decrypt(enc)).toBe('s3cret-value');
  });

  it('still decrypts legacy values (no ENC_SALT) after ENC_SALT is introduced', () => {
    // Encrypt with the legacy static salt (ENC_SALT unset, as on old installs)
    process.env.ENC_HASH = ENC_HASH;
    delete process.env.ENC_SALT;
    const legacyEnc = encrypt('old-admin-pass');

    // New instance has ENC_SALT configured — legacy value must remain readable
    process.env.ENC_SALT = ENC_SALT;
    expect(decrypt(legacyEnc)).toBe('old-admin-pass');
  });

  it('new encryptions use the per-instance salt (legacy-only decrypt fails)', () => {
    process.env.ENC_HASH = ENC_HASH;
    process.env.ENC_SALT = ENC_SALT;
    const enc = encrypt('new-value');
    delete process.env.ENC_SALT;
    expect(() => decrypt(enc)).toThrow('Failed to decrypt data');
  });

  it('fails closed without ENC_HASH', () => {
    delete process.env.ENC_HASH;
    expect(() => encrypt('x')).toThrow();
  });
});
