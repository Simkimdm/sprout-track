/**
 * Formats a Date for `<input type="datetime-local">` value (local time, minute precision).
 */
export function formatLocalDateTimeInput(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * Returns a fresh local datetime input string. Used when restoring from a
 * backgrounded tab so form defaults reflect the current clock, not a stale
 * cached value (issue #248).
 */
export function freshLocalDateTimeInput(now: Date = new Date()): string {
  return formatLocalDateTimeInput(now);
}

/**
 * Parses a local datetime input string (YYYY-MM-DDTHH:mm) back into a Date
 * in local time. Returns null for empty or invalid input.
 */
export function parseLocalDateTimeInput(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}
