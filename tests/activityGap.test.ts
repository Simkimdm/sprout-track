import { describe, it, expect } from 'vitest';
import { getPreviousEntryGapMinutes } from '@/src/utils/activityGap';

const MIN = 60_000;

describe('getPreviousEntryGapMinutes', () => {
  it('returns null when the list is empty', () => {
    expect(getPreviousEntryGapMinutes([], 1000)).toBeNull();
  });

  it('returns null when the first entry is the newest (no previous entry)', () => {
    expect(getPreviousEntryGapMinutes([5000, 4000, 3000], 5000)).toBeNull();
  });

  it('returns null when all entries are at or before the first entry', () => {
    expect(getPreviousEntryGapMinutes([4000, 3000], 5000)).toBeNull();
    expect(getPreviousEntryGapMinutes([5000, 5000], 5000)).toBeNull();
  });

  it('returns whole minutes to the immediately previous (newer) entry', () => {
    const times = [10 * MIN, 7 * MIN + 30_000, 2 * MIN];
    expect(getPreviousEntryGapMinutes(times, 2 * MIN)).toBe(5); // 7:30 - 2:00 -> floor(5.5) = 5
    expect(getPreviousEntryGapMinutes(times, 7 * MIN + 30_000)).toBe(2); // 10:00 - 7:30 -> floor(2.5) = 2
  });

  it('floors sub-minute gaps to 0 instead of rounding up', () => {
    expect(getPreviousEntryGapMinutes([1 * MIN + 30_000, 0], 0)).toBe(1);
    expect(getPreviousEntryGapMinutes([30_000, 0], 0)).toBe(0);
  });

  it('ignores entries older than the first entry', () => {
    const times = [8 * MIN, 6 * MIN, 1 * MIN];
    expect(getPreviousEntryGapMinutes(times, 6 * MIN)).toBe(2);
  });
});
