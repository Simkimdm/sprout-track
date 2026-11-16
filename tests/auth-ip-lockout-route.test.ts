import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const store = new Map<string, { kind: string; key: string; count: number; locked: boolean; expiresAt: Date }>();
  return {
    store,
    prisma: {
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

import { GET, POST, PUT, PATCH, DELETE } from '../app/api/auth/ip-lockout/route';

const req = (method: string, ip = '10.9.8.7') =>
  new NextRequest('http://localhost/api/auth/ip-lockout', {
    method,
    headers: { 'x-forwarded-for': ip },
  });

describe('auth/ip-lockout route hardening', () => {
  it('GET still returns the lockout status for the login UI', async () => {
    const res = await GET(req('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.locked).toBe('boolean');
  });

  it.each([
    ['POST', POST],
    ['PUT', PUT],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ] as const)('%s is rejected with 405 (failed attempts are tracked server-side only)', async (_m, fn) => {
    const res = await fn();
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('a rejected DELETE does not clear an existing lockout', async () => {
    const ip = '10.1.2.3';
    // 3 failed attempts -> locked (server-side helper, same as login route uses)
    const { recordFailedAttempt, checkIpLockout } = await import('../app/api/utils/ip-lockout');
    await recordFailedAttempt(ip);
    await recordFailedAttempt(ip);
    await recordFailedAttempt(ip);
    expect((await checkIpLockout(ip)).locked).toBe(true);

    await DELETE();
    expect((await checkIpLockout(ip)).locked).toBe(true);
  });
});
