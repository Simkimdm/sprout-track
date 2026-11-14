import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: {
    appConfig: { findFirst: vi.fn() },
    caretaker: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    settings: { findFirst: vi.fn(), update: vi.fn() },
    family: { findFirst: vi.fn() },
  },
}));

vi.mock('../app/api/db', () => ({ default: mocks.prisma }));
vi.mock('../prisma/log-db', () => ({ default: { apiLog: { create: vi.fn(() => Promise.resolve()) } } }));

import { POST } from '../app/api/auth/route';
import { encrypt } from '../app/api/utils/encryption';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/auth admin login: no default password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.ENC_HASH = 'ab'.repeat(32);
  });

  it('rejects "admin" when no admin password is configured (blank adminPass)', async () => {
    mocks.prisma.appConfig.findFirst.mockResolvedValue({ id: 'cfg1', adminPass: '' });
    const res = await POST(req({ adminPassword: 'admin' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not configured/i);
    expect(body.data?.token).toBeUndefined();
  });

  it('rejects the old default "admin" when a real password is set', async () => {
    mocks.prisma.appConfig.findFirst.mockResolvedValue({ id: 'cfg1', adminPass: encrypt('s3cret!') });
    const res = await POST(req({ adminPassword: 'admin' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid admin password/i);
  });

  it('accepts the configured password', async () => {
    mocks.prisma.appConfig.findFirst.mockResolvedValue({ id: 'cfg1', adminPass: encrypt('s3cret!') });
    const res = await POST(req({ adminPassword: 's3cret!' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.isSysAdmin).toBe(true);
    expect(typeof body.data.token).toBe('string');
  });
});
