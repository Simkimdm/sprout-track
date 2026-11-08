import { describe, it, expect } from 'vitest';
import {
  getMedicineExpiryInfo,
  toDateInputValue,
  fromDateInputValue,
  MEDICINE_EXPIRY_WARNING_DAYS,
} from '@/src/utils/medicineExpiry';

const now = new Date(2026, 5, 15, 10, 30); // June 15, 2026, 10:30 local time

describe('getMedicineExpiryInfo', () => {
  it('returns status none when no expiry date is set', () => {
    expect(getMedicineExpiryInfo(null, now)).toEqual({ status: 'none', daysRemaining: null });
    expect(getMedicineExpiryInfo(undefined, now)).toEqual({ status: 'none', daysRemaining: null });
    expect(getMedicineExpiryInfo('', now)).toEqual({ status: 'none', daysRemaining: null });
  });

  it('returns status none for invalid dates', () => {
    expect(getMedicineExpiryInfo('not-a-date', now)).toEqual({ status: 'none', daysRemaining: null });
  });

  it('marks a package expiring today as expiring-soon with 0 days remaining', () => {
    const info = getMedicineExpiryInfo(new Date(2026, 5, 15, 23, 59), now);
    expect(info).toEqual({ status: 'expiring-soon', daysRemaining: 0 });
  });

  it('marks packages within the warning window as expiring-soon', () => {
    const info = getMedicineExpiryInfo(new Date(2026, 5, 15 + MEDICINE_EXPIRY_WARNING_DAYS), now);
    expect(info).toEqual({ status: 'expiring-soon', daysRemaining: MEDICINE_EXPIRY_WARNING_DAYS });
  });

  it('marks packages beyond the warning window as ok', () => {
    const info = getMedicineExpiryInfo(new Date(2026, 5, 15 + MEDICINE_EXPIRY_WARNING_DAYS + 1), now);
    expect(info).toEqual({ status: 'ok', daysRemaining: MEDICINE_EXPIRY_WARNING_DAYS + 1 });
  });

  it('marks past dates as expired with negative days (overdue timer)', () => {
    const info = getMedicineExpiryInfo(new Date(2026, 5, 12, 8, 0), now);
    expect(info).toEqual({ status: 'expired', daysRemaining: -3 });
  });

  it('accepts ISO strings and compares on calendar days, not hours', () => {
    const iso = new Date(2026, 6, 5, 1, 0).toISOString(); // July 5, 2026 -> 20 days after now
    const info = getMedicineExpiryInfo(iso, now);
    expect(info.status).toBe('ok');
    expect(info.daysRemaining).toBe(20);
  });

  it('honours a custom warning window', () => {
    const info = getMedicineExpiryInfo(new Date(2026, 5, 18), now, 2);
    expect(info).toEqual({ status: 'ok', daysRemaining: 3 });
    const info2 = getMedicineExpiryInfo(new Date(2026, 5, 17), now, 2);
    expect(info2).toEqual({ status: 'expiring-soon', daysRemaining: 2 });
  });
});

describe('toDateInputValue / fromDateInputValue', () => {
  it('converts an ISO string to yyyy-MM-dd', () => {
    expect(toDateInputValue(new Date(2026, 11, 31, 15, 0).toISOString())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(toDateInputValue(new Date(2026, 0, 5).toISOString())).toMatch(/^2026-01-05$/);
  });

  it('returns empty string for missing or invalid input', () => {
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue('bogus')).toBe('');
  });

  it('converts a date input value back to an ISO string', () => {
    expect(fromDateInputValue('2026-12-31')).toBe(new Date('2026-12-31T00:00:00').toISOString());
  });

  it('returns null for empty or invalid input so the field can be cleared', () => {
    expect(fromDateInputValue('')).toBeNull();
    expect(fromDateInputValue(null)).toBeNull();
    expect(fromDateInputValue('nope')).toBeNull();
  });

  it('round-trips through both helpers', () => {
    const iso = fromDateInputValue(toDateInputValue(new Date(2027, 2, 9).toISOString()));
    expect(toDateInputValue(iso)).toBe(toDateInputValue(new Date(2027, 2, 9).toISOString()));
  });
});
