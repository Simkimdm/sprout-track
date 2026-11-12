/**
 * Milliseconds between the first displayed entry and the entry immediately
 * before it in time in the full (unfiltered) list. `sortedTimesDescMs` must be
 * the epoch-millis timestamps of all entries sorted newest-first; the previous
 * entry is the newest timestamp strictly older than `firstTimeMs`.
 * Returns null when no previous entry exists.
 */
export function getPreviousEntryGapMs(sortedTimesDescMs: number[], firstTimeMs: number): number | null {
  for (let i = 0; i < sortedTimesDescMs.length; i++) {
    if (sortedTimesDescMs[i] < firstTimeMs) {
      return firstTimeMs - sortedTimesDescMs[i];
    }
  }
  return null;
}
