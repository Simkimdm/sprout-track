import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const store = new Map<string, { kind: string; key: string; count: number; locked: boolean; expiresAt: Date }>();
  return {
    store,
    prisma: {
      appConfig: { findFirst: vi.fn() },
      caretaker: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
      settings: { findFirst: vi.fn(), update: vi.fn() },
      family: { findFirst: vi.fn() },
      securityEvent: {
        findUnique: vi.fn(async ({ where }: any) => store.get(`${where.kind_key.kind}:${where.kind_key.key}`) ?? null),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const k = `${where.kind_key.kind}:${where.kind_key.key}`;
          const cur = store.get(k);
          const row = cur ? { ...cur, ...update } : { ...create };
          store.set(k, row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const k = `${where.kind_key.kind}:${where.kind_key.key}`;
          const cur = store.get(k);
          const row = cur ? { ...cur, ...data } : null;
          if (row) store.set(k, row);
          return row;
        }),
        delete: vi.fn(async ({ where }: any) => {
          const k = `${where.kind_key.kind}:${where.kind_key.key}`;
          const row = store.get(k);
          store.delete(k);
          return row ?? null;
        }),
        deleteMany: vi.fn(async ({ where }: any) => {
          let n = 0;
          for (const [k, v] of store) {
            if (v.kind === where.kind && (!where.key || v.key === where.key) && (!where.expiresAt || v.expiresAt <= where.expiresAt.lte)) {
              store.delete(k);
              n++;
            }
          }
          return { count: n };
        }),
      },
    },
  };
});

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
    mocks.store.clear();
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

  it('records the failed attempt before the 401 response when no admin password is configured', async () => {
    mocks.prisma.appConfig.findFirst.mockResolvedValue({ id: 'cfg1', adminPass: '' });
    const res = await POST(new NextRequest('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({ adminPassword: 'admin' }),
    }));
    expect(res.status).toBe(401);
    // the lockout counter write must be complete once the response is returned
    const row = mocks.store.get('ip_lockout:203.0.113.9');
    expect(row?.count).toBe(1);
    expect(row?.locked).toBe(false);
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
