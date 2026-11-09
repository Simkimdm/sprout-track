/**
 * Night sleep window: an optional daily time window (e.g. 22:00-07:00) in
 * which sleep entries logged as NAP are automatically stored as NIGHT_SLEEP.
 * Stored per family on Settings.nightSleepWindow as JSON; null = disabled
 * (previous behavior, no automatic reclassification).
 */

export interface NightSleepWindow {
  start: string; // "HH:mm", inclusive
  end: string; // "HH:mm", exclusive
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeString(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

export function parseNightSleepWindow(raw: string | null | undefined): NightSleepWindow | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { start, end } = parsed;
    if (!isValidTimeString(start) || !isValidTimeString(end)) return null;
    if (start === end) return null;
    return { start, end };
  } catch {
    return null;
  }
}

export function serializeNightSleepWindow(window: NightSleepWindow): string {
  return JSON.stringify({ start: window.start, end: window.end });
}

export function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Minutes-of-day of a Date based on its UTC wall clock. Sleep log times are
 * entered as naive datetime-local strings and stored via toUTC(), which maps
 * the entered wall clock 1:1 onto UTC — so UTC getters return exactly the
 * time of day the user entered.
 */
export function minutesOfDayUTC(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function isWithinNightWindow(minutesOfDay: number, window: NightSleepWindow): boolean {
  const start = timeStringToMinutes(window.start);
  const end = timeStringToMinutes(window.end);
  if (start === end) return false;
  if (start < end) {
    return minutesOfDay >= start && minutesOfDay < end;
  }
  // Overnight window, e.g. 22:00-07:00 wraps midnight
  return minutesOfDay >= start || minutesOfDay < end;
}

/**
 * Reclassify a sleep type: a NAP starting inside the configured night window
 * becomes NIGHT_SLEEP. Everything else is returned unchanged (never demotes
 * an explicit NIGHT_SLEEP back to NAP).
 */
export function resolveSleepType(
  type: string,
  startTime: Date,
  window: NightSleepWindow | null
): 'NAP' | 'NIGHT_SLEEP' {
  if (type === 'NAP' && window && isWithinNightWindow(minutesOfDayUTC(startTime), window)) {
    return 'NIGHT_SLEEP';
  }
  return type === 'NIGHT_SLEEP' ? 'NIGHT_SLEEP' : 'NAP';
}
