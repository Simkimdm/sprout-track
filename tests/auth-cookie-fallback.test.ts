import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: {
    caretaker: { findFirst: vi.fn() },
    account: { findUnique: vi.fn() },
    family: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock('../app/api/db', () => ({ default: mocks.prisma }));
vi.mock('../prisma/log-db', () => ({ default: { apiLog: { create: vi.fn(() => Promise.resolve()) } } }));

import { getAuthenticatedUser } from '../app/api/utils/auth';

describe('getAuthenticatedUser: caretakerId cookie fallback removed', () => {
  it('does not authenticate via a bare caretakerId cookie (no bearer token)', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const req = new NextRequest('http://localhost/api/settings', {
      headers: { cookie: 'caretakerId=b14ccddb-b342-4081-9b3a-4b5893d65f48' },
    });
    const result = await getAuthenticatedUser(req);
    expect(result.authenticated).toBe(false);
    // The cookie must not even trigger a database lookup anymore
    expect(mocks.prisma.caretaker.findFirst).not.toHaveBeenCalled();
  });

  it('still rejects requests without any credentials', async () => {
    const req = new NextRequest('http://localhost/api/settings');
    const result = await getAuthenticatedUser(req);
    expect(result.authenticated).toBe(false);
  });
});
