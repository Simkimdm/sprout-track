/**
 * Utilities for grouping breastfeeding FeedLog rows into nursing sessions.
 *
 * A nursing session that uses both sides is stored as one FeedLog row per side
 * so per-side durations are preserved. Counting surfaces must treat the rows of
 * one session as ONE feed (issue #198); this module is the single place that
 * defines how rows group.
 *
 * Two mechanisms, in priority order:
 * 1. Explicit `sessionId` — rows sharing a sessionId are one session (any
 *    number of rows, any sides). A row whose sessionId is unique to it is a
 *    deliberate singleton: the user unlinked it, so it never merges.
 * 2. Heuristic fallback for legacy rows without a sessionId — different-side
 *    rows within SESSION_TOLERANCE_MS of each other pair up (at most one LEFT
 *    and one RIGHT; sideless rows never pair).
 */

/** Minimal shape of a feed log row needed for session grouping. */
export interface BreastFeedLike {
  type: string;
  time: string | Date;
  side?: string | null;
  feedDuration?: number | null;
  /** Older records store the duration in minutes here instead of feedDuration. */
  amount?: number | null;
  /** Explicit session link; takes precedence over the time heuristic. */
  sessionId?: string | null;
}

/**
 * Heuristic window for legacy rows without a sessionId: two different-side
 * feeds within this gap count as one nursing session, even when logged
 * separately — a break between sides is still one session. A plain time gap,
 * so it spans midnight.
 */
export const SESSION_TOLERANCE_MS = 30 * 60_000;

export interface BreastFeedSession<T extends BreastFeedLike = BreastFeedLike> {
  /** The rows that make up this session. */
  rows: T[];
  /** Time of the earliest row in the session (the day the session belongs to). */
  time: Date;
  /** Shared sessionId when the session is explicitly linked. */
  sessionId: string | null;
  /** Summed durations (seconds) of LEFT / RIGHT rows in the session. */
  leftDuration: number;
  rightDuration: number;
  totalDuration: number;
}

/**
 * Feeding duration of one row in seconds (feedDuration is in seconds; older
 * records store minutes in amount).
 */
export function feedRowDurationSeconds(row: BreastFeedLike): number {
  return row.feedDuration || (row.amount ? row.amount * 60 : 0);
}

function buildSession<T extends BreastFeedLike>(
  rows: T[],
  firstTs: number,
  sessionId: string | null
): BreastFeedSession<T> {
  let left = 0;
  let right = 0;
  let total = 0;
  for (const row of rows) {
    const duration = feedRowDurationSeconds(row);
    total += duration;
    if (row.side === 'LEFT') left += duration;
    else if (row.side === 'RIGHT') right += duration;
  }
  return {
    rows,
    time: new Date(firstTs),
    sessionId,
    leftDuration: left,
    rightDuration: right,
    totalDuration: total,
  };
}

/**
 * Group BREAST rows into nursing sessions: by shared `sessionId` when present,
 * otherwise by the time heuristic. Non-BREAST rows are ignored. Sessions are
 * returned sorted by start time.
 */
export function groupBreastFeedSessions<T extends BreastFeedLike>(
  feeds: T[],
  toleranceMs: number = SESSION_TOLERANCE_MS
): BreastFeedSession<T>[] {
  const sorted = feeds
    .filter(f => f.type === 'BREAST')
    // Pair by the displayed time (side start when known): timer rows stamp
    // `time` with the session end, so raw `time` can push the two sides of
    // one session apart while their starts are close together.
    .map(f => ({ row: f, ts: new Date(breastFeedDisplayTime({ time: f.time, startTime: (f as { startTime?: string | Date | null }).startTime })).getTime() }))
    .sort((a, b) => a.ts - b.ts);

  const sessions: BreastFeedSession<T>[] = [];

  // Explicitly linked rows group by sessionId, regardless of gaps or sides
  const bySessionId = new Map<string, { rows: T[]; firstTs: number }>();
  for (const { row, ts } of sorted) {
    if (!row.sessionId) continue;
    const group = bySessionId.get(row.sessionId);
    if (group) {
      group.rows.push(row);
    } else {
      bySessionId.set(row.sessionId, { rows: [row], firstTs: ts });
    }
  }
  bySessionId.forEach((group, sessionId) => {
    sessions.push(buildSession(group.rows, group.firstTs, sessionId));
  });

  // Heuristic pairing for rows without a sessionId
  let current: { rows: T[]; sides: Set<string>; firstTs: number; lastTs: number } | null = null;

  const flush = () => {
    if (!current) return;
    sessions.push(buildSession(current.rows, current.firstTs, null));
    current = null;
  };

  for (const { row, ts } of sorted) {
    if (row.sessionId) continue;
    const side = row.side || null;
    const joins =
      current !== null &&
      side !== null &&
      current.sides.size > 0 &&
      !current.sides.has(side) &&
      ts - current.lastTs <= toleranceMs;

    if (joins && current) {
      current.rows.push(row);
      current.sides.add(side!);
      current.lastTs = ts;
    } else {
      flush();
      current = { rows: [row], sides: new Set(side ? [side] : []), firstTs: ts, lastTs: ts };
    }
  }
  flush();

  return sessions.sort((a, b) => a.time.getTime() - b.time.getTime());
}

/**
 * Generate a new session id. crypto.randomUUID is unavailable in insecure
 * browser contexts (plain-http self-hosted deployments), so fall back to a
 * timestamp+random id there.
 */
export function newFeedSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `fs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Timestamp to display for a breast feed row: the side's start when known.
 * Rows created by the timer before v1.6.3 stamp `time` with the session end,
 * so `time` alone is only trustworthy as a fallback (issue #240).
 */
export function breastFeedDisplayTime(row: {
  time: string | Date;
  startTime?: string | Date | null;
}): string {
  const value = row.startTime ?? row.time;
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Number of nursing sessions represented by the given feed logs
 * (linked or paired rows count once; non-BREAST rows are ignored).
 */
export function countBreastFeedSessions(
  feeds: BreastFeedLike[],
  toleranceMs: number = SESSION_TOLERANCE_MS
): number {
  return groupBreastFeedSessions(feeds, toleranceMs).length;
}

/** Feed row shape needed to compute per-row "time since last feeding" gaps. */
export interface FeedGapRow extends BreastFeedLike {
  id: string;
  startTime?: string | Date | null;
}

export interface FeedGapInfo {
  /** Seconds since the previous feeding (END = pause, START = start-to-start); 0 when no previous feeding exists at all. */
  gapSeconds: number;
  /** Duration of this feeding in seconds (summed over all rows of a breast session). */
  durationSeconds: number;
}

/**
 * Signed "x:yy" elapsed label, e.g. 8100s -> "+2:15", -270s -> "-0:05".
 * Used next to the recording time in the filtered timeline, where the gap to
 * the previous feeding is always in the past and therefore carries a "+".
 */
export function formatSignedElapsedHM(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '+';
  const abs = Math.abs(Math.round(totalSeconds));
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  return `${sign}${hours}:${String(minutes).padStart(2, '0')}`;
}

/** Plain "x:yy" duration label, e.g. 840s -> "0:14", 8100s -> "2:15". */
export function formatDurationHM(totalSeconds: number): string {
  const abs = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

/** Word-style duration, e.g. 704s -> "11m 44s", 8100s -> "2h 15m", 0 -> "0s". */
export function formatDurationWords(totalSeconds: number): string {
  const abs = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Map each feed row id to its "time since the previous feeding" gap and its own
 * duration. Each feed row is measured individually, so the second side of a
 * bracketed L+R session shows the pause since the first side ended. The gap is
 * anchored per `from`: previous row's START by default (`from: 'start'`); with
 * `from: 'end'` it is the pause (current start minus previous END = start +
 * duration), matching the baby's feedTimerFrom setting. SOLIDS rows are not
 * feedings (they live under the food log).
 */
/** One feeding/sleeping point on the gap timeline. */
export interface GapPoint {
  rowIds: string[];
  startTs: number;
  endTs: number;
  durationSeconds: number;
}

/**
 * Map row ids to their gap since the previous point and their own duration.
 * The gap is anchored per `from`: previous END (pause) or START; 0 when no
 * previous point exists at all.
 */
export function buildGapMap(
  points: GapPoint[],
  from: 'start' | 'end' = 'start'
): Map<string, FeedGapInfo> {
  const result = new Map<string, FeedGapInfo>();
  const sorted = [...points].sort((a, b) => a.startTs - b.startTs);
  sorted.forEach((point, index) => {
    const prev = index > 0 ? sorted[index - 1] : null;
    const info: FeedGapInfo = {
      gapSeconds: prev
        ? Math.max(0, point.startTs - (from === 'end' ? prev.endTs : prev.startTs)) / 1000
        : 0,
      durationSeconds: point.durationSeconds,
    };
    for (const rowId of point.rowIds) {
      result.set(rowId, info);
    }
  });
  return result;
}

export function buildFeedGapMap<T extends FeedGapRow>(
  feeds: T[],
  from: 'start' | 'end' = 'start',
  historyFeeds: T[] = []
): Map<string, FeedGapInfo> {
  const points: GapPoint[] = [];

  // History rows (feeds before the viewed day) only serve as gap anchors so
  // the first entry of a day can measure its gap across midnight; they are
  // still included in the map, which is harmless (their ids are never rendered).
  const allFeeds = [...historyFeeds, ...feeds];

  // Every feed row is its own gap point, so the second side of a bracketed
  // L+R session shows the pause since the first side ended. (Session grouping
  // for the bracket itself happens in the component via groupBreastFeedSessions.)
  for (const row of allFeeds) {
    if (row.type === 'SOLIDS') continue;
    const startTs = new Date(breastFeedDisplayTime(row)).getTime();
    // BREAST: amount may hold legacy minutes; other types: amount is a volume
    const durationSeconds = row.type === 'BREAST'
      ? feedRowDurationSeconds(row)
      : (row.feedDuration || 0);
    points.push({
      rowIds: [row.id],
      startTs,
      endTs: startTs + durationSeconds * 1000,
      durationSeconds,
    });
  }

  return buildGapMap(points, from);
}
