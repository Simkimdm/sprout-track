import { describe, it, expect } from 'vitest';
import {
  computeLatestStatus,
  effectiveFeedTime,
  elapsedMinutes,
  feedStartAnchor,
  formatDurationLabel,
  isPastWarning,
  isWithinStatusWindow,
  warningTimeToMinutes,
} from '@/src/utils/latestStatus';

const bottle = (id: string, time: string, bottleType: string | null = 'Formula') =>
  ({ id, type: 'BOTTLE', bottleType, amount: 4, time, startTime: null, endTime: null, sessionId: null, side: null });
const breast = (id: string, side: string, startTime: string, endTime: string, sessionId: string | null = null) =>
  ({ id, type: 'BREAST', bottleType: null, amount: null, side, time: endTime, startTime, endTime, sessionId, feedDuration: 600 });
const food = (id: string, time: string) => ({ id, foodId: 'f1', time, enjoyment: null });
const sleep = (id: string, startTime: string, endTime: string | null) =>
  ({ id, type: 'NAP', startTime, endTime, duration: endTime ? 60 : null, location: 'Crib' });

describe('computeLatestStatus — feeds', () => {
  it('returns nothing for no activities', () => {
    expect(computeLatestStatus([], null)).toEqual({ lastPumpTime: undefined });
  });

  it('picks the most recent counted feed', () => {
    const s = computeLatestStatus([bottle('a', '2026-10-12T08:00:00Z'), bottle('b', '2026-10-12T11:00:00Z')], null);
    expect(s.lastFeedTime?.toISOString()).toBe('2026-10-12T11:00:00.000Z');
    expect(s.lastFeedEndTime).toBeUndefined();
  });

  it('skips feeds of excluded types (feedTimerTypes)', () => {
    const acts = [bottle('formula', '2026-10-12T11:00:00Z', 'Formula'), bottle('milk', '2026-10-12T09:00:00Z', 'Breast Milk')];
    const s = computeLatestStatus(acts, ['BOTTLE_BREAST_MILK']);
    expect(s.lastFeedTime?.toISOString()).toBe('2026-10-12T09:00:00.000Z');
  });

  it('returns no feed when every feed is excluded', () => {
    expect(computeLatestStatus([bottle('a', '2026-10-12T11:00:00Z')], ['BREAST']).lastFeedTime).toBeUndefined();
  });

  it('counts food only when FOOD is a timer category (or all feeds count)', () => {
    const acts = [bottle('a', '2026-10-12T08:00:00Z'), food('f', '2026-10-12T12:00:00Z')];
    expect(computeLatestStatus(acts, null).lastFeedTime?.toISOString()).toBe('2026-10-12T12:00:00.000Z');
    expect(computeLatestStatus(acts, ['BOTTLE_FORMULA']).lastFeedTime?.toISOString()).toBe('2026-10-12T08:00:00.000Z');
    expect(computeLatestStatus(acts, ['FOOD']).lastFeedTime?.toISOString()).toBe('2026-10-12T12:00:00.000Z');
  });

  it('times a linked breast session from its first start to its last end', () => {
    const acts = [
      breast('l', 'LEFT', '2026-10-12T10:00:00Z', '2026-10-12T10:10:00Z', 's1'),
      breast('r', 'RIGHT', '2026-10-12T10:12:00Z', '2026-10-12T10:25:00Z', 's1'),
    ];
    const s = computeLatestStatus(acts, null);
    expect(s.lastFeedTime?.toISOString()).toBe('2026-10-12T10:00:00.000Z');
    expect(s.lastFeedEndTime?.toISOString()).toBe('2026-10-12T10:25:00.000Z');
  });

  it('reports the whole session duration so the badge includes the feeding itself', () => {
    // 15 min LEFT + 15 min RIGHT; at 15:00 the badge shows 30 min since the
    // end (14:30) plus the 30 min duration = 60 min since the feed started
    const breast15 = (id: string, side: string, startTime: string, endTime: string, sessionId: string | null) =>
      ({ id, type: 'BREAST', bottleType: null, amount: null, side, time: endTime, startTime, endTime, sessionId, feedDuration: 900 });
    const acts = [
      breast15('l', 'LEFT', '2026-10-12T14:00:00Z', '2026-10-12T14:15:00Z', 's1'),
      breast15('r', 'RIGHT', '2026-10-12T14:15:00Z', '2026-10-12T14:30:00Z', 's1'),
    ];
    const s = computeLatestStatus(acts, null);
    expect(s.lastFeedDurationMinutes).toBe(30);
    const end = s.lastFeedEndTime!;
    const badgeAnchor = new Date(end.getTime() - s.lastFeedDurationMinutes! * 60_000);
    expect(badgeAnchor.toISOString()).toBe('2026-10-12T14:00:00.000Z');
    expect(elapsedMinutes(badgeAnchor, new Date('2026-10-12T15:00:00Z'))).toBe(60);
  });

  it('falls back to the single row duration when the session is a singleton', () => {
    const s = computeLatestStatus([breast('l', 'LEFT', '2026-10-12T14:00:00Z', '2026-10-12T14:10:00Z', 's1')], null);
    expect(s.lastFeedDurationMinutes).toBe(10);
  });

  it('counts a manually logged row (time = start, no endTime) from its start, not start minus duration', () => {
    // Manually entered feed: 21:08, 8 min 11 s; `time` holds the start, there is no endTime
    const row = { id: 'm1', type: 'BREAST', bottleType: null, amount: null, side: 'RIGHT', time: '2026-10-12T21:08:00Z', startTime: null, endTime: null, sessionId: null, feedDuration: 491 };
    const s = computeLatestStatus([row], null);
    expect(s.lastFeedTime?.toISOString()).toBe('2026-10-12T21:08:00.000Z');
    expect(s.lastFeedDurationMinutes).toBeCloseTo(491 / 60);
    const anchor = feedStartAnchor(s.lastFeedTime, s.lastFeedEndTime, s.lastFeedDurationMinutes);
    expect(anchor?.toISOString()).toBe('2026-10-12T21:08:00.000Z');
    expect(elapsedMinutes(anchor!, new Date('2026-10-12T21:30:00Z'))).toBe(22);
  });
});

describe('feedStartAnchor', () => {
  const start = new Date('2026-10-12T14:00:00Z');
  const end = new Date('2026-10-12T14:30:00Z');

  it('is undefined without a feed start', () => {
    expect(feedStartAnchor(undefined, end, 30)).toBeUndefined();
  });

  it('falls back to the feed start when end or duration is missing', () => {
    expect(feedStartAnchor(start, undefined, 30)).toBe(start);
    expect(feedStartAnchor(start, end, undefined)).toBe(start);
    expect(feedStartAnchor(start, end, 0)).toBe(start);
  });

  it('anchors at end minus duration when that equals the session start', () => {
    expect(feedStartAnchor(start, end, 30)?.toISOString()).toBe('2026-10-12T14:00:00.000Z');
  });

  it('clamps to the feed start when end minus duration would precede it', () => {
    // Manual row: end === start, so end − duration would double-count the feeding
    expect(feedStartAnchor(start, start, 8.2)?.toISOString()).toBe('2026-10-12T14:00:00.000Z');
  });
});

describe('computeLatestStatus — sleep', () => {
  it('reports an ongoing sleep and the last completed one', () => {
    const acts = [sleep('old', '2026-10-12T06:00:00Z', '2026-10-12T07:00:00Z'), sleep('now', '2026-10-12T12:00:00Z', null)];
    const s = computeLatestStatus(acts, null);
    expect(s.ongoingSleep?.id).toBe('now');
    expect(s.lastSleepEndTime?.toISOString()).toBe('2026-10-12T07:00:00.000Z');
  });

  it('uses the latest end time among completed sleeps', () => {
    const acts = [sleep('a', '2026-10-12T06:00:00Z', '2026-10-12T07:00:00Z'), sleep('b', '2026-10-12T09:00:00Z', '2026-10-12T10:30:00Z')];
    const s = computeLatestStatus(acts, null);
    expect(s.ongoingSleep).toBeUndefined();
    expect(s.lastSleepEndTime?.toISOString()).toBe('2026-10-12T10:30:00.000Z');
    expect(s.lastEndedSleep?.id).toBe('b');
  });

  it('does not mistake feeds or food for sleep', () => {
    const s = computeLatestStatus([breast('l', 'LEFT', '2026-10-12T10:00:00Z', '2026-10-12T10:10:00Z'), food('f', '2026-10-12T12:00:00Z')], null);
    expect(s.ongoingSleep).toBeUndefined();
    expect(s.lastSleepEndTime).toBeUndefined();
  });
});

describe('effectiveFeedTime', () => {
  const start = new Date('2026-10-12T10:00:00Z');
  const end = new Date('2026-10-12T10:25:00Z');
  it('uses the start by default', () => {
    expect(effectiveFeedTime(start, end, 'start')).toBe(start);
    expect(effectiveFeedTime(start, end, undefined)).toBe(start);
  });
  it('uses the end when feedTimerFrom is "end" and an end exists', () => {
    expect(effectiveFeedTime(start, end, 'end')).toBe(end);
  });
  it('falls back to the start when there is no end time (e.g. bottle)', () => {
    expect(effectiveFeedTime(start, undefined, 'end')).toBe(start);
  });
  it('returns undefined without a feed', () => {
    expect(effectiveFeedTime(undefined, undefined, 'end')).toBeUndefined();
  });
});

describe('warning thresholds', () => {
  it('parses hh:mm', () => {
    expect(warningTimeToMinutes('03:00')).toBe(180);
    expect(warningTimeToMinutes('1:30')).toBe(90);
  });
  it('rejects empty or malformed values', () => {
    expect(warningTimeToMinutes(undefined)).toBeNull();
    expect(warningTimeToMinutes('')).toBeNull();
    expect(warningTimeToMinutes('abc')).toBeNull();
  });
  it('warns at exactly the threshold, not before', () => {
    expect(isPastWarning(179, '03:00')).toBe(false);
    expect(isPastWarning(180, '03:00')).toBe(true);
    expect(isPastWarning(500, null)).toBe(false);
  });
});

describe('elapsedMinutes / isWithinStatusWindow', () => {
  it('floors whole minutes', () => {
    expect(elapsedMinutes(new Date('2026-10-12T10:00:00Z'), new Date('2026-10-12T10:59:59Z'))).toBe(59);
  });
  it('measures real elapsed time across a DST change', () => {
    // US fall-back: 2026-11-01 01:30 EDT -> 01:30 EST is one wall-clock repeat, 60 real minutes
    expect(elapsedMinutes(new Date('2026-11-01T05:30:00Z'), new Date('2026-11-01T06:30:00Z'))).toBe(60);
  });
  it('treats 24 h or more as outside the window', () => {
    expect(isWithinStatusWindow(1439)).toBe(true);
    expect(isWithinStatusWindow(1440)).toBe(false);
  });
});

describe('formatDurationLabel', () => {
  const t = (k: string) => k;
  it('speaks hours and minutes with singular/plural units', () => {
    expect(formatDurationLabel(83, t)).toBe('1 hour 23 minutes');
    expect(formatDurationLabel(121, t)).toBe('2 hours 1 minute');
    expect(formatDurationLabel(5, t)).toBe('5 minutes');
  });
});

describe('computeLatestStatus — next medicine due (per-medicine timer)', () => {
  const med = (id: string, medicineId: string, time: string, warningTime: string | null, name = medicineId) =>
    ({ id, medicineId, time, doseAmount: 5, medicine: { id: medicineId, name, warningTime } });

  it('is undefined when no medicine log exists', () => {
    expect(computeLatestStatus([bottle('f1', '2026-10-12T09:00:00Z')], null).nextMedicineDue).toBeUndefined();
  });

  it('ignores medicines without a timer and picks the soonest due time', () => {
    const acts = [
      med('a', 'm-slow', '2026-10-12T08:00:00Z', '24:00', 'Slow'),   // due 2026-10-13T08:00
      med('b', 'm-fast', '2026-10-12T10:00:00Z', '06:00', 'Fast'),   // due 2026-10-12T16:00
      med('c', 'm-none', '2026-10-12T11:00:00Z', null, 'None'),      // no timer
    ];
    const s = computeLatestStatus(acts, null);
    expect(s.nextMedicineDue?.medicineId).toBe('m-fast');
    expect(s.nextMedicineDue?.medicineName).toBe('Fast');
    expect(s.nextMedicineDue?.warningTime).toBe('06:00');
    expect(s.nextMedicineDue?.lastDoseTime.toISOString()).toBe('2026-10-12T10:00:00.000Z');
    expect(s.nextMedicineDue?.dueAt.toISOString()).toBe('2026-10-12T16:00:00.000Z');
  });

  it('uses the latest dose per medicine when several logs exist', () => {
    const acts = [
      med('a', 'm1', '2026-10-12T08:00:00Z', '06:00', 'M1'), // older dose -> due 14:00
      med('b', 'm1', '2026-10-12T12:00:00Z', '06:00', 'M1'), // latest dose -> due 18:00
    ];
    const s = computeLatestStatus(acts, null);
    expect(s.nextMedicineDue?.lastDoseTime.toISOString()).toBe('2026-10-12T12:00:00.000Z');
    expect(s.nextMedicineDue?.dueAt.toISOString()).toBe('2026-10-12T18:00:00.000Z');
  });

  it('supports day-scale timers (hours may exceed 24) and skips malformed values', () => {
    const acts = [
      med('a', 'm1', '2026-10-12T08:00:00Z', '168:00', 'Weekly'), // 7 days -> due 2026-10-19
      med('b', 'm2', '2026-10-12T09:00:00Z', 'bogus', 'Broken'),
    ];
    const s = computeLatestStatus(acts, null);
    expect(s.nextMedicineDue?.medicineId).toBe('m1');
    expect(s.nextMedicineDue?.dueAt.toISOString()).toBe('2026-10-19T08:00:00.000Z');
  });
});
