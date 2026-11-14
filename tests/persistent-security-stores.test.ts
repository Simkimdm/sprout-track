import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const store = new Map<string, { kind: string; key: string; count: number; locked: boolean; expiresAt: Date }>();
  const delegate = {
    findUnique: vi.fn(async ({ where }: any) => store.get(`${where.kind_key.kind}:${where.kind_key.key}`) ?? null),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const k = `${where.kind_key.kind}:${where.kind_key.key}`;
      const cur = store.get(k);
      const row = cur ? { ...cur, ...update } : { ...create };
      store.set(k, row);
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
  };
  return {
    store,
    prisma: {
      securityEvent: delegate,
      caretaker: { findFirst: vi.fn() },
      account: { findUnique: vi.fn() },
      family: { findUnique: vi.fn() },
    },
  };
});

vi.mock('../app/api/db', () => ({ default: mocks.prisma }));
vi.mock('../prisma/log-db', () => ({ default: { apiLog: { create: vi.fn(() => Promise.resolve()) } } }));

import { checkIpLockout, recordFailedAttempt, resetFailedAttempts } from '../app/api/utils/ip-lockout';
import { invalidateToken } from '../app/api/utils/auth';
import jwt from 'jsonwebtoken';

describe('DB-backed ip lockout', () => {
  beforeEach(() => {
    mocks.store.clear();
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
  });

  it('locks after 3 failed attempts and stays locked', async () => {
    expect((await checkIpLockout('1.1.1.1')).locked).toBe(false);
    expect((await recordFailedAttempt('1.1.1.1')).locked).toBe(false);
    expect((await recordFailedAttempt('1.1.1.1')).locked).toBe(false);
    expect((await recordFailedAttempt('1.1.1.1')).locked).toBe(true);
    const status = await checkIpLockout('1.1.1.1');
    expect(status.locked).toBe(true);
    expect(status.remainingTime).toBeGreaterThan(0);
  });

  it('reset clears the lockout (successful login)', async () => {
    await recordFailedAttempt('2.2.2.2');
    await recordFailedAttempt('2.2.2.2');
    await recordFailedAttempt('2.2.2.2');
    expect((await checkIpLockout('2.2.2.2')).locked).toBe(true);
    await resetFailedAttempts('2.2.2.2');
    expect((await checkIpLockout('2.2.2.2')).locked).toBe(false);
  });

  it('expired lockout window resets the counter', async () => {
    mocks.store.set('ip_lockout:3.3.3.3', {
      kind: 'ip_lockout', key: '3.3.3.3', count: 0, locked: true, expiresAt: new Date(Date.now() - 1000),
    });
    expect((await checkIpLockout('3.3.3.3')).locked).toBe(false);
  });
});

describe('DB-backed token blacklist', () => {
  beforeEach(() => {
    mocks.store.clear();
    process.env.JWT_SECRET = 'test-secret';
  });

  it('invalidated token is stored as hash only, until its exp', async () => {
    const token = jwt.sign({ id: 'x' }, 'test-secret', { expiresIn: '1h' });
    expect(await invalidateToken(token)).toBe(true);
    const rows = [...mocks.store.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('token_blacklist');
    expect(rows[0].key).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].key).not.toContain(token);
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
