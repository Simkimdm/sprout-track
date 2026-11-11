import { describe, it, expect } from 'vitest';
import { formatTimeDisplay, detectDefaultTimeFormat } from '@/src/utils/dateFormat';

describe('formatTimeDisplay', () => {
  const date = new Date(2026, 0, 1, 15, 4); // Jan 1 2026, 15:04 local

  it('renders AM/PM in 12h mode', () => {
    expect(formatTimeDisplay(date, '12h')).toBe('3:04 PM');
  });

  it('renders zero-padded 24h time in 24h mode', () => {
    expect(formatTimeDisplay(date, '24h')).toBe('15:04');
    expect(formatTimeDisplay(new Date(2026, 0, 1, 0, 4), '24h')).toBe('00:04');
  });
});

describe('detectDefaultTimeFormat', () => {
  it('returns a valid TimeFormatSetting consistent with the device locale', () => {
    const detected = detectDefaultTimeFormat();
    expect(['12h', '24h']).toContain(detected);
    // The detected format must match how the locale renders 15:00
    const probe = new Intl.DateTimeFormat().format(new Date(2026, 0, 1, 15, 0));
    const probeIs12h = /am|pm/i.test(probe);
    expect(detected).toBe(probeIs12h ? '12h' : '24h');
  });
});
