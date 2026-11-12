import { describe, it, expect } from 'vitest';
import { getPreviousEntryGapMs } from '@/src/utils/activityGap';

const MIN = 60_000;

describe('getPreviousEntryGapMs', () => {
  it('returns null when the list is empty', () => {
    expect(getPreviousEntryGapMs([], 1000)).toBeNull();
  });

  it('returns null when the first entry is the oldest (no previous entry in time)', () => {
    expect(getPreviousEntryGapMs([5000, 4000, 3000], 3000)).toBeNull();
  });

  it('returns null when all entries are at or after the first entry', () => {
    expect(getPreviousEntryGapMs([5000, 4000], 3000)).toBeNull();
    expect(getPreviousEntryGapMs([3000, 3000], 3000)).toBeNull();
  });

  it('returns the gap to the immediately previous (older) entry', () => {
    const times = [10 * MIN, 7 * MIN + 30_000, 2 * MIN];
    expect(getPreviousEntryGapMs(times, 10 * MIN)).toBe(2 * MIN + 30_000); // 10:00 - 7:30
    expect(getPreviousEntryGapMs(times, 7 * MIN + 30_000)).toBe(5 * MIN + 30_000); // 7:30 - 2:00
  });

  it('measures in milliseconds, not whole minutes', () => {
    expect(getPreviousEntryGapMs([1 * MIN + 30_000, 0], 1 * MIN + 30_000)).toBe(1 * MIN + 30_000);
    expect(getPreviousEntryGapMs([30_000, 0], 30_000)).toBe(30_000);
  });

  it('ignores entries newer than the first entry', () => {
    const times = [8 * MIN, 6 * MIN, 1 * MIN];
    expect(getPreviousEntryGapMs(times, 6 * MIN)).toBe(5 * MIN);
  });
});
