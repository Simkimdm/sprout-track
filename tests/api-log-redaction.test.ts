import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(() => Promise.resolve()),
}));

vi.mock('../prisma/log-db', () => ({ default: { apiLog: { create: mocks.create } } }));

import { logApiCall, redactSensitive } from '../app/api/utils/api-logger';

describe('redactSensitive', () => {
  it('redacts credentials at any nesting level', () => {
    const out = redactSensitive({
      email: 'a@b.c',
      password: 'pw',
      nested: { securityPin: '1234', list: [{ token: 'jwt' }] },
      adminPassword: 'x',
    }) as any;
    expect(out.email).toBe('a@b.c');
    expect(out.password).toBe('[REDACTED]');
    expect(out.nested.securityPin).toBe('[REDACTED]');
    expect(out.nested.list[0].token).toBe('[REDACTED]');
    expect(out.adminPassword).toBe('[REDACTED]');
  });

  it('is case-insensitive on keys', () => {
    expect((redactSensitive({ SecurityPIN: '1', APIKEY: 'k' }) as any).SecurityPIN).toBe('[REDACTED]');
    expect((redactSensitive({ SecurityPIN: '1', APIKEY: 'k' }) as any).APIKEY).toBe('[REDACTED]');
  });

  it('passes through primitives and arrays', () => {
    expect(redactSensitive('plain')).toBe('plain');
    expect(redactSensitive([1, 2, { pin: '9' }])).toEqual([1, 2, { pin: '[REDACTED]' }]);
  });
});

describe('logApiCall redacts bodies before writing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_LOG = 'true';
  });

  it('never stores raw passwords/tokens in the log DB', async () => {
    await logApiCall({
      method: 'POST',
      path: '/api/auth',
      status: 200,
      requestBody: { loginId: '01', securityPin: '111222' },
      responseBody: { success: true, data: { token: 'jwt-secret' } },
    });
    const stored = mocks.create.mock.calls[0]?.[0].data;
    expect(stored.requestBody).toBe(JSON.stringify({ loginId: '01', securityPin: '[REDACTED]' }));
    expect(stored.responseBody).not.toContain('jwt-secret');
    expect(JSON.parse(stored.responseBody).data.token).toBe('[REDACTED]');
  });

  it('does nothing when ENABLE_LOG is not true', async () => {
    process.env.ENABLE_LOG = 'false';
    await logApiCall({ method: 'GET', path: '/x', requestBody: { password: 'pw' } });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
