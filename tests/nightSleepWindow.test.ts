import { describe, it, expect } from 'vitest';
import {
  isValidTimeString,
  parseNightSleepWindow,
  serializeNightSleepWindow,
  timeStringToMinutes,
  minutesOfDayUTC,
  isWithinNightWindow,
  resolveSleepType,
} from '@/src/utils/nightSleepWindow';

// Sleep times are stored via toUTC(), which maps the entered wall clock 1:1
// onto UTC — so tests build dates with Date.UTC().
const atUTC = (h: number, m = 0) => new Date(Date.UTC(2026, 0, 15, h, m));

describe('isValidTimeString', () => {
  it('accepts HH:mm within 00:00-23:59', () => {
    expect(isValidTimeString('00:00')).toBe(true);
    expect(isValidTimeString('22:00')).toBe(true);
    expect(isValidTimeString('07:30')).toBe(true);
    expect(isValidTimeString('23:59')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isValidTimeString('24:00')).toBe(false);
    expect(isValidTimeString('7:00')).toBe(false);
    expect(isValidTimeString('22:60')).toBe(false);
    expect(isValidTimeString('')).toBe(false);
    expect(isValidTimeString(null)).toBe(false);
    expect(isValidTimeString(undefined)).toBe(false);
    expect(isValidTimeString(123)).toBe(false);
  });
});

describe('parseNightSleepWindow', () => {
  it('returns null when disabled (default / previous behavior)', () => {
    expect(parseNightSleepWindow(null)).toBeNull();
    expect(parseNightSleepWindow(undefined)).toBeNull();
    expect(parseNightSleepWindow('')).toBeNull();
  });

  it('parses a valid window', () => {
    expect(parseNightSleepWindow('{"start":"22:00","end":"07:00"}')).toEqual({
      start: '22:00',
      end: '07:00',
    });
  });

  it('returns null for malformed JSON or invalid times', () => {
    expect(parseNightSleepWindow('not json')).toBeNull();
    expect(parseNightSleepWindow('{"start":"22:00"}')).toBeNull();
    expect(parseNightSleepWindow('{"start":"25:00","end":"07:00"}')).toBeNull();
    expect(parseNightSleepWindow('{"start":"22:00","end":"22:00"}')).toBeNull();
    expect(parseNightSleepWindow('[1,2]')).toBeNull();
  });

  it('round-trips through serializeNightSleepWindow', () => {
    const window = { start: '21:30', end: '06:15' };
    expect(parseNightSleepWindow(serializeNightSleepWindow(window))).toEqual(window);
  });
});

describe('isWithinNightWindow', () => {
  const overnight = { start: '22:00', end: '07:00' };

  it('matches an overnight window (22:00-07:00) across midnight', () => {
    expect(isWithinNightWindow(timeStringToMinutes('22:00'), overnight)).toBe(true);
    expect(isWithinNightWindow(timeStringToMinutes('23:59'), overnight)).toBe(true);
    expect(isWithinNightWindow(timeStringToMinutes('00:00'), overnight)).toBe(true);
    expect(isWithinNightWindow(timeStringToMinutes('06:59'), overnight)).toBe(true);
  });

  it('excludes times outside the overnight window', () => {
    expect(isWithinNightWindow(timeStringToMinutes('21:59'), overnight)).toBe(false);
    expect(isWithinNightWindow(timeStringToMinutes('07:00'), overnight)).toBe(false);
    expect(isWithinNightWindow(timeStringToMinutes('12:00'), overnight)).toBe(false);
  });

  it('matches a same-day window', () => {
    const day = { start: '12:00', end: '14:00' };
    expect(isWithinNightWindow(timeStringToMinutes('12:00'), day)).toBe(true);
    expect(isWithinNightWindow(timeStringToMinutes('13:30'), day)).toBe(true);
    expect(isWithinNightWindow(timeStringToMinutes('14:00'), day)).toBe(false);
    expect(isWithinNightWindow(timeStringToMinutes('11:59'), day)).toBe(false);
  });

  it('treats start === end as no window', () => {
    expect(isWithinNightWindow(timeStringToMinutes('22:00'), { start: '22:00', end: '22:00' })).toBe(false);
  });
});

describe('minutesOfDayUTC', () => {
  it('reads the UTC wall clock', () => {
    expect(minutesOfDayUTC(atUTC(23, 30))).toBe(23 * 60 + 30);
    expect(minutesOfDayUTC(atUTC(0, 0))).toBe(0);
  });
});

describe('resolveSleepType', () => {
  const window = { start: '22:00', end: '07:00' };

  it('reclassifies a NAP starting inside the window as NIGHT_SLEEP', () => {
    expect(resolveSleepType('NAP', atUTC(22, 0), window)).toBe('NIGHT_SLEEP');
    expect(resolveSleepType('NAP', atUTC(23, 30), window)).toBe('NIGHT_SLEEP');
    expect(resolveSleepType('NAP', atUTC(6, 45), window)).toBe('NIGHT_SLEEP');
  });

  it('keeps a NAP outside the window as NAP', () => {
    expect(resolveSleepType('NAP', atUTC(12, 0), window)).toBe('NAP');
    expect(resolveSleepType('NAP', atUTC(7, 0), window)).toBe('NAP');
    expect(resolveSleepType('NAP', atUTC(21, 59), window)).toBe('NAP');
  });

  it('never changes an explicit NIGHT_SLEEP', () => {
    expect(resolveSleepType('NIGHT_SLEEP', atUTC(12, 0), window)).toBe('NIGHT_SLEEP');
    expect(resolveSleepType('NIGHT_SLEEP', atUTC(23, 0), null)).toBe('NIGHT_SLEEP');
  });

  it('leaves everything unchanged when no window is configured (default)', () => {
    expect(resolveSleepType('NAP', atUTC(23, 0), null)).toBe('NAP');
    expect(resolveSleepType('NAP', atUTC(3, 0), null)).toBe('NAP');
  });
});
