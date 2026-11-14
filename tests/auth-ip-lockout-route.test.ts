import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
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
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);
    expect(checkIpLockout(ip).locked).toBe(true);

    await DELETE();
    expect(checkIpLockout(ip).locked).toBe(true);
  });
});
