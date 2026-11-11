/**
 * Whole minutes between the first displayed entry and the entry immediately
 * before it in the full (unfiltered) list. `sortedTimesDescMs` must be the
 * epoch-millis timestamps of all entries sorted newest-first; the previous
 * entry is the first timestamp strictly newer than `firstTimeMs`.
 * Returns null when no previous entry exists.
 */
export function getPreviousEntryGapMinutes(sortedTimesDescMs: number[], firstTimeMs: number): number | null {
  for (let i = sortedTimesDescMs.length - 1; i >= 0; i--) {
    if (sortedTimesDescMs[i] > firstTimeMs) {
      return Math.floor((sortedTimesDescMs[i] - firstTimeMs) / 60000);
    }
  }
  return null;
}
