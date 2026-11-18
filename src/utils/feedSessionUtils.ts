/**
 * Utilities for grouping breastfeeding FeedLog rows into nursing sessions.
 *
 * A nursing session that uses both sides is stored as one FeedLog row per side
 * so per-side durations are preserved. Counting surfaces must treat the rows of
 * one session as ONE feed (issue #198); this module is the single place that
 * defines how rows group.
 *
 * Grouping mechanisms, in priority order:
 * 1. `unlinked` rows (the user explicitly detached them) are always singletons
 *    and never merge with anything.
 * 2. Explicit links — rows sharing a `sessionId` over 2+ rows are one session
 *    regardless of gaps or sides (deliberate "link").
 * 3. Time-based auto-grouping within the baby's feedSessionGroupingMinutes
 *    interval (default SESSION_TOLERANCE_MS; 0 = off): every remaining row —
 *    with no sessionId OR a sessionId unique to it (e.g. a single-side timer
 *    run) — chains into the current session when the pause (previous row's
 *    end → this row's start, clamped at 0) is within the tolerance, whatever
 *    side it used (a repeated side within the interval is a re-latch, not a
 *    new feeding); sideless rows never join. Linked sessions of 2+ rows also
 *    merge with each other within the tolerance.
 */

/** Minimal shape of a feed log row needed for session grouping. */
export interface BreastFeedLike {
  type: string;
  time: string | Date;
  side?: string | null;
  feedDuration?: number | null;
  /** Older records store the duration in minutes here instead of feedDuration. */
  amount?: number | null;
  /** Explicit session link; rows sharing it (2+ rows) always group together. */
  sessionId?: string | null;
  /** Set by "unlink": the row never takes part in time-based auto-grouping. */
  unlinked?: boolean | null;
}

/**
 * Default heuristic window for rows without a sessionId: two different-side
 * feeds whose pause (previous end → next start) is within this window count
 * as one nursing session, even when logged separately — a break between sides
 * is still one session. A plain time gap, so it spans midnight. Overridable
 * per baby via feedSessionGroupingMinutes (0 = never group automatically).
 */
export const SESSION_TOLERANCE_MS = 30 * 60_000;

/**
 * Convert the baby's feedSessionGroupingMinutes setting into the heuristic
 * tolerance in ms. null/undefined falls back to SESSION_TOLERANCE_MS; 0 stays
 * 0 and disables automatic grouping (groupBreastFeedSessions skips pairing
 * when the tolerance is not positive).
 */
export function feedSessionGroupingToleranceMs(minutes: number | null | undefined): number {
  if (minutes === null || minutes === undefined) return SESSION_TOLERANCE_MS;
  return Math.max(0, Math.round(minutes)) * 60_000;
}

/** Selectable values (minutes) for the feedSessionGroupingMinutes setting; 0 = off. */
export const FEED_SESSION_GROUPING_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60] as const;

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
 * otherwise by the pause heuristic — a row joins the current group when the
 * pause since the previous row's end is within `toleranceMs` (0 disables the
 * heuristic). Linked sessions of 2+ rows additionally merge with each other
 * within the tolerance. Non-BREAST rows are ignored. Sessions are returned
 * sorted by start time.
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

  // Rows the user explicitly unlinked are always singletons
  const chainable: { row: T; ts: number }[] = [];
  for (const entry of sorted) {
    if (entry.row.unlinked) {
      sessions.push(buildSession([entry.row], entry.ts, entry.row.sessionId ?? null));
    } else {
      chainable.push(entry);
    }
  }

  // Explicitly linked rows (a sessionId shared by 2+ rows) group together,
  // regardless of gaps or sides. A sessionId unique to a single row (e.g. a
  // single-side timer run) is NOT a deliberate unlink — those rows fall through
  // to the time-based chaining below.
  const sessionIdCounts = new Map<string, number>();
  for (const { row } of chainable) {
    if (row.sessionId) sessionIdCounts.set(row.sessionId, (sessionIdCounts.get(row.sessionId) ?? 0) + 1);
  }
  const bySessionId = new Map<string, { rows: T[]; firstTs: number }>();
  for (const { row, ts } of chainable) {
    if (!row.sessionId || (sessionIdCounts.get(row.sessionId) ?? 0) < 2) continue;
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

  // Time-based chaining for the remaining rows. The gap between two rows
  // is the pause: this row's start minus the previous row's end (start +
  // duration), clamped at 0 — the feeding's own duration must not count as a
  // break between sides. Any side may join (a repeated side within the
  // interval is a re-latch, not a new feeding); sideless rows never join.
  // A tolerance of 0 disables the chaining entirely.
  let current: { rows: T[]; sides: Set<string>; firstTs: number; lastEndTs: number } | null = null;

  const flush = () => {
    if (!current) return;
    sessions.push(buildSession(current.rows, current.firstTs, null));
    current = null;
  };

  for (const { row, ts } of chainable) {
    if (row.sessionId && (sessionIdCounts.get(row.sessionId) ?? 0) >= 2) continue;
    const side = row.side || null;
    const endTs = ts + feedRowDurationSeconds(row) * 1000;
    const pauseMs = current ? Math.max(0, ts - current.lastEndTs) : Infinity;
    const joins =
      current !== null &&
      toleranceMs > 0 &&
      side !== null &&
      current.sides.size > 0 &&
      pauseMs <= toleranceMs;

    if (joins && current) {
      current.rows.push(row);
      current.sides.add(side!);
      current.lastEndTs = Math.max(current.lastEndTs, endTs);
    } else {
      flush();
      current = { rows: [row], sides: new Set(side ? [side] : []), firstTs: ts, lastEndTs: endTs };
    }
  }
  flush();

  sessions.sort((a, b) => a.time.getTime() - b.time.getTime());

  // Merge adjacent linked sessions (shared sessionId, 2+ rows each — e.g. two
  // timer runs a couple of minutes apart) when the pause between them is within
  // the tolerance. Unlinked rows and heuristic groups never merge with linked ones.
  if (toleranceMs > 0) {
    const rowTs = (r: T) => new Date(breastFeedDisplayTime({ time: r.time, startTime: (r as { startTime?: string | Date | null }).startTime })).getTime();
    const sessionEndTs = (s: BreastFeedSession<T>) =>
      Math.max(...s.rows.map(r => rowTs(r) + feedRowDurationSeconds(r) * 1000));
    const merged: BreastFeedSession<T>[] = [];
    let open: { rows: T[]; firstTs: number; sessionId: string | null; linked: boolean; lastEndTs: number } | null = null;
    for (const session of sessions) {
      const linked = session.sessionId !== null && session.rows.length >= 2;
      const endTs = sessionEndTs(session);
      const canMerge =
        open !== null &&
        linked &&
        open.linked &&
        Math.max(0, session.time.getTime() - open.lastEndTs) <= toleranceMs;
      if (canMerge && open) {
        open.rows.push(...session.rows);
        open.lastEndTs = Math.max(open.lastEndTs, endTs);
      } else {
        if (open) merged.push(buildSession(open.rows, open.firstTs, open.sessionId));
        open = { rows: [...session.rows], firstTs: session.time.getTime(), sessionId: session.sessionId, linked, lastEndTs: endTs };
      }
    }
    if (open) merged.push(buildSession(open.rows, open.firstTs, open.sessionId));
    return merged;
  }

  return sessions;
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
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `fs-${Date.now().toString(36)}-${rand}`;
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
  return buildGapMap(buildFeedGapPoints(feeds, historyFeeds), from);
}

/**
 * Gap points for feed rows. History rows (feeds before the viewed day) only serve as
 * gap anchors so the first entry of a day can measure its gap across midnight; they are
 * still included, which is harmless (their ids are never rendered). Every feed row is
 * its own gap point, so the second side of a bracketed L+R session shows the pause
 * since the first side ended. (Session grouping for the bracket itself happens in the
 * component via groupBreastFeedSessions.)
 */
export function buildFeedGapPoints<T extends FeedGapRow>(
  feeds: T[],
  historyFeeds: T[] = []
): GapPoint[] {
  const points: GapPoint[] = [];
  for (const row of [...historyFeeds, ...feeds]) {
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
  return points;
}

/**
 * Like buildGapMap, but keys each gap to the OLDER point of the pair: the list renders
 * newest first and a divider renders above its entry, so keying the gap to the older
 * entry places the divider between the two entries. When the older point is not part
 * of the rendered list (history anchor across midnight), the gap stays on the newer
 * point so it still shows above the first entry of the day.
 */
export function buildGapDividerMap(
  points: GapPoint[],
  from: 'start' | 'end' = 'start',
  renderedRowIds?: Set<string>
): Map<string, FeedGapInfo> {
  const result = new Map<string, FeedGapInfo>();
  const sorted = [...points].sort((a, b) => a.startTs - b.startTs);
  const crossBoundary: { rowIds: string[]; info: FeedGapInfo }[] = [];
  sorted.forEach((point, index) => {
    const prev = index > 0 ? sorted[index - 1] : null;
    if (!prev) return;
    const info: FeedGapInfo = {
      gapSeconds: Math.max(0, point.startTs - (from === 'end' ? prev.endTs : prev.startTs)) / 1000,
      durationSeconds: point.durationSeconds,
    };
    if (renderedRowIds && !prev.rowIds.some(id => renderedRowIds.has(id))) {
      // gap anchored at an unrendered history row (e.g. previous day): stays on the newer
      // point so the first entry of the day shows its divider to the previous day's last entry
      crossBoundary.push({ rowIds: point.rowIds, info });
    } else {
      for (const rowId of prev.rowIds) {
        result.set(rowId, info);
      }
    }
  });
  // cross-boundary gaps win on the first entry of the day, so they are not overwritten
  // by the between-entry gap when the day has several entries of the same type
  for (const cb of crossBoundary) {
    for (const rowId of cb.rowIds) {
      result.set(rowId, cb.info);
    }
  }
  return result;
}
