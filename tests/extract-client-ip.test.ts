import { describe, expect, it } from 'vitest';
import { extractClientIp } from '../app/api/utils/api-logger';
import { getClientIp } from '../src/utils/short-link-utils';

const headers = (xff: string | null, realIp: string | null = null) =>
  new Headers({
    ...(xff ? { 'x-forwarded-for': xff } : {}),
    ...(realIp ? { 'x-real-ip': realIp } : {}),
  });

describe('extractClientIp (rightmost XFF, anti-spoofing)', () => {
  it('takes the rightmost XFF entry, not the spoofable leftmost', () => {
    // client sends "1.2.3.4", trusted proxy appends real address "203.0.113.9"
    expect(extractClientIp(headers('1.2.3.4, 203.0.113.9'))).toBe('203.0.113.9');
  });

  it('single XFF value is used', () => {
    expect(extractClientIp(headers('198.51.100.7'))).toBe('198.51.100.7');
  });

  it('falls back to x-real-ip, then unknown', () => {
    expect(extractClientIp(headers(null, '192.0.2.5'))).toBe('192.0.2.5');
    expect(extractClientIp(headers(null))).toBe('unknown');
  });

  it('trims whitespace around entries', () => {
    expect(extractClientIp(headers(' 10.0.0.1 ,  10.0.0.2 '))).toBe('10.0.0.2');
  });

  it('short-link-utils getClientIp uses the same rightmost logic', () => {
    expect(getClientIp(headers('9.9.9.9, 203.0.113.9'))).toBe('203.0.113.9');
  });
});
