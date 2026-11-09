import { describe, it, expect } from 'vitest';
import {
  formatLocalDateTimeInput,
  freshLocalDateTimeInput,
  parseLocalDateTimeInput,
} from '@/src/utils/dateTimeInput';

describe('formatLocalDateTimeInput', () => {
  it('formats a Date as YYYY-MM-DDTHH:mm in local time', () => {
    const date = new Date(2026, 6, 28, 14, 5); // July 28, 2026 14:05 local
    expect(formatLocalDateTimeInput(date)).toBe('2026-07-28T14:05');
  });

  it('zero-pads month, day, hours, and minutes', () => {
    const date = new Date(2026, 0, 3, 9, 7); // Jan 3, 2026 09:07 local
    expect(formatLocalDateTimeInput(date)).toBe('2026-01-03T09:07');
  });

  it('ignores seconds and milliseconds', () => {
    const date = new Date(2026, 6, 28, 16, 0, 45, 500);
    expect(formatLocalDateTimeInput(date)).toBe('2026-07-28T16:00');
  });
});

describe('freshLocalDateTimeInput (issue #248 visibility restore)', () => {
  it('uses the provided clock rather than a cached value', () => {
    const stale = new Date(2026, 6, 28, 14, 0);
    const current = new Date(2026, 6, 28, 16, 30);

    const staleFormatted = formatLocalDateTimeInput(stale);
    const refreshed = freshLocalDateTimeInput(current);

    expect(staleFormatted).toBe('2026-07-28T14:00');
    expect(refreshed).toBe('2026-07-28T16:30');
    expect(refreshed).not.toBe(staleFormatted);
  });
});

describe('parseLocalDateTimeInput', () => {
  it('parses a local datetime string back into a local Date', () => {
    const parsed = parseLocalDateTimeInput('2026-07-28T14:05');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(6);
    expect(parsed!.getDate()).toBe(28);
    expect(parsed!.getHours()).toBe(14);
    expect(parsed!.getMinutes()).toBe(5);
  });

  it('round-trips with formatLocalDateTimeInput', () => {
    const original = new Date(2026, 0, 3, 9, 7);
    expect(parseLocalDateTimeInput(formatLocalDateTimeInput(original))?.getTime()).toBe(original.getTime());
  });

  it('returns null for empty or invalid input', () => {
    expect(parseLocalDateTimeInput('')).toBeNull();
    expect(parseLocalDateTimeInput('not-a-date')).toBeNull();
  });
});
