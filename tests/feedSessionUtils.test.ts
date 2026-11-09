import { describe, it, expect } from 'vitest';
import {
  groupBreastFeedSessions,
  countBreastFeedSessions,
  breastFeedDisplayTime,
  buildFeedGapMap,
  buildGapDividerMap,
  buildFeedGapPoints,
  formatSignedElapsedHM,
  formatDurationHM,
  formatDurationWords,
} from '@/src/utils/feedSessionUtils';

// Issue #198: a nursing session using both sides is stored as two FeedLog rows
// (one per side); counting surfaces must treat the pair as one feed.
const at = (iso: string) => new Date(iso);

describe('groupBreastFeedSessions', () => {
  it('groups a timer-created left+right pair (identical time) into one session', () => {
    const rows = [
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'LEFT', feedDuration: 480 },
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'RIGHT', feedDuration: 360 },
    ];
    const sessions = groupBreastFeedSessions(rows);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].leftDuration).toBe(480);
    expect(sessions[0].rightDuration).toBe(360);
    expect(sessions[0].totalDuration).toBe(840);
    expect(sessions[0].rows).toHaveLength(2);
  });

  it('groups separately-logged sides with a break in between (e.g. 20 minutes apart)', () => {
    const rows = [
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'LEFT', feedDuration: 480 },
      { type: 'BREAST', time: at('2026-07-10T10:20:00Z'), side: 'RIGHT', feedDuration: 360 },
    ];
    expect(countBreastFeedSessions(rows)).toBe(1);
  });

  it('does not merge feeds more than 30 minutes apart', () => {
    const rows = [
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'LEFT', feedDuration: 480 },
      { type: 'BREAST', time: at('2026-07-10T10:31:00Z'), side: 'RIGHT', feedDuration: 360 },
    ];
    expect(countBreastFeedSessions(rows)).toBe(2);
  });

  it('groups a session that spans midnight', () => {
    const rows = [
      { type: 'BREAST', time: at('2026-07-10T23:50:00Z'), side: 'LEFT', feedDuration: 600 },
      { type: 'BREAST', time: at('2026-07-11T00:10:00Z'), side: 'RIGHT', feedDuration: 480 },
    ];
    const sessions = groupBreastFeedSessions(rows);
    expect(sessions).toHaveLength(1);
    // The session belongs to the day it started
    expect(sessions[0].time.toISOString()).toBe('2026-07-10T23:50:00.000Z');
    expect(sessions[0].totalDuration).toBe(1080);
  });

  it('falls back to amount (minutes) for older records without feedDuration', () => {
    const rows = [
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'LEFT', amount: 8 },
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'RIGHT', feedDuration: 360 },
    ];
    const sessions = groupBreastFeedSessions(rows);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].leftDuration).toBe(480);
    expect(sessions[0].rightDuration).toBe(360);
  });

  it('does not merge same-side feeds even when close together', () => {
    const rows = [
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'LEFT', feedDuration: 300 },
      { type: 'BREAST', time: at('2026-07-10T10:00:30Z'), side: 'LEFT', feedDuration: 300 },
    ];
    expect(countBreastFeedSessions(rows)).toBe(2);
  });

  it('counts a single-side feed as one session', () => {
    const rows = [{ type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'LEFT', feedDuration: 480 }];
    expect(countBreastFeedSessions(rows)).toBe(1);
  });

  it('never pairs rows without a side', () => {
    const rows = [
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: null, feedDuration: 480 },
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'RIGHT', feedDuration: 360 },
    ];
    expect(countBreastFeedSessions(rows)).toBe(2);
  });

  it('counts a sideless row\'s duration in the session total', () => {
    const rows = [{ type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: null, feedDuration: 491 }];
    const sessions = groupBreastFeedSessions(rows);
    expect(sessions[0].leftDuration).toBe(0);
    expect(sessions[0].rightDuration).toBe(0);
    expect(sessions[0].totalDuration).toBe(491);
  });

  it('ignores non-BREAST rows', () => {
    const rows = [
      { type: 'BOTTLE', time: at('2026-07-10T10:00:00Z'), side: null },
      { type: 'SOLIDS', time: at('2026-07-10T11:00:00Z'), side: null },
      { type: 'BREAST', time: at('2026-07-10T12:00:00Z'), side: 'LEFT', feedDuration: 480 },
    ];
    expect(countBreastFeedSessions(rows)).toBe(1);
  });

  it('handles a full day of mixed sessions in arbitrary order', () => {
    const rows = [
      // session 2: right only
      { type: 'BREAST', time: at('2026-07-10T14:00:00Z'), side: 'RIGHT', feedDuration: 600 },
      // session 1: both sides, 15 minutes apart
      { type: 'BREAST', time: at('2026-07-10T08:45:00Z'), side: 'RIGHT', feedDuration: 360 },
      { type: 'BREAST', time: at('2026-07-10T08:30:00Z'), side: 'LEFT', feedDuration: 480 },
      // session 3: both sides via timer
      { type: 'BREAST', time: at('2026-07-10T18:15:10Z'), side: 'LEFT', feedDuration: 420 },
      { type: 'BREAST', time: at('2026-07-10T18:15:10Z'), side: 'RIGHT', feedDuration: 300 },
    ];
    const sessions = groupBreastFeedSessions(rows);
    expect(sessions).toHaveLength(3);
    // sorted by time
    expect(sessions[0].totalDuration).toBe(840);
    expect(sessions[1].rightDuration).toBe(600);
    expect(sessions[2].totalDuration).toBe(720);
  });

  it('accepts string timestamps (client-side activity objects)', () => {
    const rows = [
      { type: 'BREAST', time: '2026-07-10T10:00:00.000Z', side: 'LEFT', feedDuration: 480 },
      { type: 'BREAST', time: '2026-07-10T10:00:00.000Z', side: 'RIGHT', feedDuration: 360 },
    ];
    expect(countBreastFeedSessions(rows)).toBe(1);
  });

  it('returns an empty list for no feeds', () => {
    expect(groupBreastFeedSessions([])).toEqual([]);
  });
});

describe('explicit sessionId linking', () => {
  it('groups rows sharing a sessionId regardless of time gap', () => {
    const rows = [
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'LEFT', feedDuration: 120, sessionId: 's1' },
      { type: 'BREAST', time: at('2026-07-10T11:30:00Z'), side: 'RIGHT', feedDuration: 600, sessionId: 's1' },
    ];
    const sessions = groupBreastFeedSessions(rows);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe('s1');
    expect(sessions[0].totalDuration).toBe(720);
  });

  it("supports the user's three-feed example: left 2m + right 10m + separate 5m all linked", () => {
    const rows = [
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'LEFT', feedDuration: 120, sessionId: 's1' },
      { type: 'BREAST', time: at('2026-07-10T10:05:00Z'), side: 'RIGHT', feedDuration: 600, sessionId: 's1' },
      { type: 'BREAST', time: at('2026-07-10T10:45:00Z'), side: 'LEFT', feedDuration: 300, sessionId: 's1' },
    ];
    const sessions = groupBreastFeedSessions(rows);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].rows).toHaveLength(3);
    expect(sessions[0].leftDuration).toBe(420);
    expect(sessions[0].rightDuration).toBe(600);
  });

  it('a unique sessionId is a deliberate singleton: an unlinked feed never re-merges heuristically', () => {
    const rows = [
      // These two would merge under the 30-min heuristic, but the user unlinked them
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'LEFT', feedDuration: 480, sessionId: 'solo-1' },
      { type: 'BREAST', time: at('2026-07-10T10:05:00Z'), side: 'RIGHT', feedDuration: 360, sessionId: 'solo-2' },
    ];
    expect(countBreastFeedSessions(rows)).toBe(2);
  });

  it('linked rows never absorb nearby unlinked rows; unlinked rows still pair heuristically', () => {
    const rows = [
      { type: 'BREAST', time: at('2026-07-10T10:00:00Z'), side: 'LEFT', feedDuration: 120, sessionId: 's1' },
      { type: 'BREAST', time: at('2026-07-10T10:02:00Z'), side: 'RIGHT', feedDuration: 600, sessionId: 's1' },
      // Legacy rows without sessionId, close to the linked pair
      { type: 'BREAST', time: at('2026-07-10T10:10:00Z'), side: 'LEFT', feedDuration: 300 },
      { type: 'BREAST', time: at('2026-07-10T10:20:00Z'), side: 'RIGHT', feedDuration: 200 },
    ];
    const sessions = groupBreastFeedSessions(rows);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].sessionId).toBe('s1');
    expect(sessions[1].sessionId).toBeNull();
    expect(sessions[1].rows).toHaveLength(2);
  });

  it('sessions are sorted by start time across linked and heuristic groups', () => {
    const rows = [
      { type: 'BREAST', time: at('2026-07-10T14:00:00Z'), side: 'LEFT', feedDuration: 300 },
      { type: 'BREAST', time: at('2026-07-10T08:00:00Z'), side: 'RIGHT', feedDuration: 300, sessionId: '早' },
    ];
    const sessions = groupBreastFeedSessions(rows);
    expect(sessions[0].sessionId).toBe('早');
    expect(sessions[1].sessionId).toBeNull();
  });
});

// Issue #240: rows created by the timer before the fix stamp `time` with the
// session end; displays must prefer startTime so those legacy rows still show
// the side's actual start.
describe('breastFeedDisplayTime', () => {
  it('prefers startTime when present', () => {
    expect(
      breastFeedDisplayTime({
        time: '2026-07-22T13:02:00.000Z',
        startTime: '2026-07-22T13:00:00.000Z',
      })
    ).toBe('2026-07-22T13:00:00.000Z');
  });

  it('falls back to time when startTime is missing or null', () => {
    expect(breastFeedDisplayTime({ time: '2026-07-22T13:02:00.000Z' })).toBe(
      '2026-07-22T13:02:00.000Z'
    );
    expect(
      breastFeedDisplayTime({ time: '2026-07-22T13:02:00.000Z', startTime: null })
    ).toBe('2026-07-22T13:02:00.000Z');
  });

  it('serializes Date values to ISO strings', () => {
    expect(
      breastFeedDisplayTime({
        time: '2026-07-22T13:02:00.000Z',
        startTime: new Date('2026-07-22T13:00:00.000Z'),
      })
    ).toBe('2026-07-22T13:00:00.000Z');
  });
});

describe('formatSignedElapsedHM', () => {
  it('formats positive gaps with a plus sign in x:yy', () => {
    expect(formatSignedElapsedHM(8100)).toBe('+2:15');
    expect(formatSignedElapsedHM(270)).toBe('+0:04');
    expect(formatSignedElapsedHM(0)).toBe('+0:00');
  });

  it('formats negative gaps with a minus sign', () => {
    expect(formatSignedElapsedHM(-270)).toBe('-0:04');
    expect(formatSignedElapsedHM(-3600)).toBe('-1:00');
  });
});

describe('formatDurationHM', () => {
  it('formats durations as x:yy', () => {
    expect(formatDurationHM(840)).toBe('0:14');
    expect(formatDurationHM(8100)).toBe('2:15');
    expect(formatDurationHM(0)).toBe('0:00');
  });
});

describe('buildFeedGapMap', () => {
  it('gives the first feeding a 0 gap and later feeds the gap to the previous one', () => {
    const feeds = [
      { id: 'f1', type: 'BOTTLE', time: at('2026-07-22T10:00:00Z'), amount: 120 },
      { id: 'f2', type: 'BOTTLE', time: at('2026-07-22T12:30:00Z'), amount: 100 },
    ];
    const gaps = buildFeedGapMap(feeds);
    expect(gaps.get('f1')).toEqual({ gapSeconds: 0, durationSeconds: 0 });
    expect(gaps.get('f2')).toEqual({ gapSeconds: 9000, durationSeconds: 0 });
  });

  it('anchors the first entry of a day at the last feeding before that day (history)', () => {
    const history = [
      { id: 'h1', type: 'BOTTLE', time: at('2026-07-21T22:00:00Z'), amount: 120 },
    ];
    const feeds = [
      { id: 'f1', type: 'BOTTLE', time: at('2026-07-22T06:00:00Z'), amount: 100 },
    ];
    // start-to-start: 22:00 -> 06:00 = 8h
    expect(buildFeedGapMap(feeds, 'start', history).get('f1')!.gapSeconds).toBe(28800);
    // no history at all -> 0
    expect(buildFeedGapMap(feeds, 'start').get('f1')!.gapSeconds).toBe(0);
  });

  it('measures each row individually: second side of an L+R session gets the pause since the first side ended', () => {
    const feeds = [
      { id: 'b1', type: 'BOTTLE', time: at('2026-07-22T08:00:00Z'), amount: 90 },
      { id: 'l', type: 'BREAST', time: at('2026-07-22T10:00:00Z'), side: 'LEFT', feedDuration: 480, sessionId: 's1' },
      { id: 'r', type: 'BREAST', time: at('2026-07-22T10:08:00Z'), side: 'RIGHT', feedDuration: 360, sessionId: 's1' },
      { id: 'b2', type: 'BOTTLE', time: at('2026-07-22T13:15:00Z'), amount: 110 },
    ];
    // anchor 'start': gaps are start-to-start per row
    const gaps = buildFeedGapMap(feeds, 'start');
    expect(gaps.get('l')).toEqual({ gapSeconds: 7200, durationSeconds: 480 });
    expect(gaps.get('r')).toEqual({ gapSeconds: 480, durationSeconds: 360 });
    expect(gaps.get('b2')).toEqual({ gapSeconds: 11220, durationSeconds: 0 });
    // anchor 'end': r's gap is the pause since l ended (10:00+8m = 10:08 -> 0)
    const gapsEnd = buildFeedGapMap(feeds, 'end');
    expect(gapsEnd.get('l')).toEqual({ gapSeconds: 7200, durationSeconds: 480 });
    expect(gapsEnd.get('r')).toEqual({ gapSeconds: 0, durationSeconds: 360 });
    // b2 measures from r's end (10:08 + 6m = 10:14)
    expect(gapsEnd.get('b2')).toEqual({ gapSeconds: 10860, durationSeconds: 0 });
  });

  it('ignores SOLIDS rows (food logs are not feedings here)', () => {
    const feeds = [
      { id: 'f1', type: 'BOTTLE', time: at('2026-07-22T10:00:00Z'), amount: 120 },
      { id: 's1', type: 'SOLIDS', time: at('2026-07-22T11:00:00Z'), amount: 30 },
      { id: 'f2', type: 'BOTTLE', time: at('2026-07-22T12:00:00Z'), amount: 100 },
    ];
    const gaps = buildFeedGapMap(feeds);
    expect(gaps.has('s1')).toBe(false);
    expect(gaps.get('f2')!.gapSeconds).toBe(7200);
  });
});

describe('buildFeedGapMap from start/end anchor', () => {
  const feeds = [
    { id: 'f1', type: 'BOTTLE', time: at('2026-07-22T10:00:00Z'), amount: 120, feedDuration: 600 },
    { id: 'f2', type: 'BOTTLE', time: at('2026-07-22T10:20:00Z'), amount: 100 },
  ];

  it("from 'start' (default) measures start-to-start", () => {
    expect(buildFeedGapMap(feeds).get('f2')!.gapSeconds).toBe(1200);
    expect(buildFeedGapMap(feeds, 'start').get('f2')!.gapSeconds).toBe(1200);
  });

  it("from 'end' measures the pause (previous end = start + duration)", () => {
    // f1 ends at 10:10 -> pause until 10:20 is 10 min, not 20
    expect(buildFeedGapMap(feeds, 'end').get('f2')).toEqual({ gapSeconds: 600, durationSeconds: 0 });
  });

  it('clamps the gap at 0 when entries overlap', () => {
    const overlapping = [
      { id: 'f1', type: 'BOTTLE', time: at('2026-07-22T10:00:00Z'), amount: 120, feedDuration: 1800 },
      { id: 'f2', type: 'BOTTLE', time: at('2026-07-22T10:10:00Z'), amount: 100 },
    ];
    expect(buildFeedGapMap(overlapping, 'end').get('f2')!.gapSeconds).toBe(0);
  });
});

describe('buildGapDividerMap', () => {
  const points = [
    { rowIds: ['old'], startTs: at('2026-07-22T01:00:00Z').getTime(), endTs: at('2026-07-22T01:00:00Z').getTime(), durationSeconds: 0 },
    { rowIds: ['new'], startTs: at('2026-07-22T05:58:00Z').getTime(), endTs: at('2026-07-22T05:58:00Z').getTime(), durationSeconds: 0 },
  ];

  it('keys the gap to the older entry so the divider renders between the pair', () => {
    const dividers = buildGapDividerMap(points, 'start', new Set(['old', 'new']));
    expect(dividers.has('new')).toBe(false);
    expect(dividers.get('old')!.gapSeconds).toBe(4 * 3600 + 58 * 60);
  });

  it('keeps the gap on the newer entry when the older one is an unrendered history anchor', () => {
    const withHistory = [
      { rowIds: ['hist'], startTs: at('2026-07-21T22:00:00Z').getTime(), endTs: at('2026-07-21T22:00:00Z').getTime(), durationSeconds: 0 },
      { rowIds: ['f1'], startTs: at('2026-07-22T06:00:00Z').getTime(), endTs: at('2026-07-22T06:00:00Z').getTime(), durationSeconds: 0 },
    ];
    const dividers = buildGapDividerMap(withHistory, 'start', new Set(['f1']));
    expect(dividers.get('f1')!.gapSeconds).toBe(8 * 3600);
    expect(dividers.has('hist')).toBe(false);
  });

  it('anchors at the previous end when from is end', () => {
    const withDuration = [
      { rowIds: ['s1'], startTs: at('2026-07-22T10:00:00Z').getTime(), endTs: at('2026-07-22T11:00:00Z').getTime(), durationSeconds: 3600 },
      { rowIds: ['s2'], startTs: at('2026-07-22T14:00:00Z').getTime(), endTs: at('2026-07-22T15:30:00Z').getTime(), durationSeconds: 5400 },
    ];
    const dividers = buildGapDividerMap(withDuration, 'end', new Set(['s1', 's2']));
    expect(dividers.get('s1')!.gapSeconds).toBe(3 * 3600);
    expect(dividers.has('s2')).toBe(false);
  });

  it('buildFeedGapPoints includes history rows as anchors and skips SOLIDS', () => {
    const feeds = [
      { id: 'f1', type: 'BOTTLE', time: at('2026-07-22T06:00:00Z'), amount: 100 },
      { id: 's1', type: 'SOLIDS', time: at('2026-07-22T12:00:00Z'), amount: 50 },
    ];
    const history = [{ id: 'h1', type: 'BOTTLE', time: at('2026-07-21T22:00:00Z'), amount: 90 }];
    const points = buildFeedGapPoints(feeds as any, history as any);
    expect(points.map(p => p.rowIds[0])).toEqual(['h1', 'f1']);
  });
});

describe('formatDurationWords', () => {
  it('formats as words like the details line', () => {
    expect(formatDurationWords(704)).toBe('11m 44s');
    expect(formatDurationWords(600)).toBe('10m');
    expect(formatDurationWords(8100)).toBe('2h 15m');
    expect(formatDurationWords(0)).toBe('0s');
    expect(formatDurationWords(45)).toBe('45s');
  });
});
