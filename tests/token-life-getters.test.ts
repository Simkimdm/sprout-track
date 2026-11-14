import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: { caretaker: { findFirst: vi.fn() }, account: { findUnique: vi.fn() }, family: { findUnique: vi.fn() } },
}));

vi.mock('../app/api/db', () => ({ default: mocks.prisma }));
vi.mock('../prisma/log-db', () => ({ default: { apiLog: { create: vi.fn(() => Promise.resolve()) } } }));

import { getAccessTokenLife, getRefreshTokenLife } from '../app/api/utils/auth';

describe('token lifetime getters read env at call time', () => {
  afterEach(() => {
    delete process.env.AUTH_LIFE;
    delete process.env.REFRESH_TOKEN_LIFE;
  });

  it('uses defaults when env unset', () => {
    expect(getAccessTokenLife()).toBe(1800);
    expect(getRefreshTokenLife()).toBe(604800);
  });

  it('picks up runtime env changes without restart', () => {
    process.env.AUTH_LIFE = '60';
    expect(getAccessTokenLife()).toBe(60);
    process.env.AUTH_LIFE = '120';
    expect(getAccessTokenLife()).toBe(120);
    process.env.REFRESH_TOKEN_LIFE = '3600';
    expect(getRefreshTokenLife()).toBe(3600);
  });

  it('falls back to defaults on invalid values', () => {
    process.env.AUTH_LIFE = 'abc';
    expect(getAccessTokenLife()).toBe(1800);
    process.env.REFRESH_TOKEN_LIFE = '-5';
    expect(getRefreshTokenLife()).toBe(604800);
  });
});
