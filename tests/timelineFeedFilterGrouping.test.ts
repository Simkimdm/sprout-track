import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

vi.mock('@/src/context/localization', () => ({ useLocalization: () => ({ t: (k: string) => k }) }));
vi.mock('@/src/context/theme', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('@/app/context/timezone', () => ({ useTimezone: () => ({ dateFormat: 'MM/DD/YYYY', timeFormat: '12h' }) }));
vi.mock('@/src/hooks/useUnit', () => ({ useUnit: () => ({ unitSymbol: (u: string) => u }) }));
vi.mock('@/src/hooks/useAuthedImage', () => ({
  useAuthedImage: () => ({ src: null }),
  useInView: () => ({ ref: () => {}, inView: false }),
  photoFileUrl: () => '',
}));

import TimelineV2ActivityList from '@/src/components/Timeline/TimelineV2/TimelineV2ActivityList';
import { buildFeedGapMap, buildFeedGapPoints, buildGapMap, buildGapDividerMap, FeedGapInfo, FeedGapRow } from '@/src/utils/feedSessionUtils';
import { formatDateShort } from '@/src/utils/dateFormat';

// mirror of TimelineV2's gapById computation
const computeGapById = (activities: any[], history: any[], from: 'start' | 'end'): Map<string, FeedGapInfo> => {
  const isFeed = (a: any) => 'amount' in a && 'type' in a && !('foodId' in a) && a.type !== 'SOLIDS';
  const feedGaps = buildFeedGapMap(activities.filter(isFeed) as FeedGapRow[], from, history.filter(isFeed) as FeedGapRow[]);
  const sleepPoints = activities
    .filter(a => 'duration' in a && 'startTime' in a && !('activities' in a))
    .map(a => {
      const startTs = new Date(a.startTime).getTime();
      const dur = (a.duration || 0) * 60;
      return { rowIds: [a.id], startTs, endTs: a.endTime ? new Date(a.endTime).getTime() : startTs + dur * 1000, durationSeconds: dur };
    });
  return new Map([...feedGaps, ...buildGapMap(sleepPoints, 'end')]);
};

// mirror of TimelineV2's dividerGapById computation (gaps keyed to the older entry)
const computeDividerGapById = (activities: any[], history: any[]): Map<string, FeedGapInfo> => {
  const isFeed = (a: any) => 'amount' in a && 'type' in a && !('foodId' in a) && a.type !== 'SOLIDS';
  const renderedIds = new Set(activities.map(a => a.id));
  const feedDividers = buildGapDividerMap(
    buildFeedGapPoints(activities.filter(isFeed) as FeedGapRow[], history.filter(isFeed) as FeedGapRow[]),
    'end', renderedIds
  );
  const isSleep = (a: any) => 'duration' in a && 'startTime' in a && !('activities' in a);
  const sleepPoints = [...history, ...activities]
    .filter(isSleep)
    .map(a => {
      const startTs = new Date(a.startTime).getTime();
      const dur = (a.duration || 0) * 60;
      return { rowIds: [a.id], startTs, endTs: a.endTime ? new Date(a.endTime).getTime() : startTs + dur * 1000, durationSeconds: dur };
    });
  return new Map([...feedDividers, ...buildGapDividerMap(sleepPoints, 'end', renderedIds)]);
};

const feed = (id: string, type: string, time: string, extra: Record<string, unknown> = {}) => ({
  id, babyId: 'b1', type, time, amount: type === 'BREAST' ? null : 100, ...extra,
});

// A linked L+R breast session plus bottle feeds around it
const activities = [
  feed('b1', 'BOTTLE', '2026-07-22T08:00:00.000Z'),
  feed('l1', 'BREAST', '2026-07-22T10:10:00.000Z', { startTime: '2026-07-22T10:00:00.000Z', side: 'LEFT', feedDuration: 480, sessionId: 's1' }),
  feed('r1', 'BREAST', '2026-07-22T10:10:00.000Z', { startTime: '2026-07-22T10:08:00.000Z', side: 'RIGHT', feedDuration: 360, sessionId: 's1' }),
  feed('b2', 'BOTTLE', '2026-07-22T13:15:00.000Z'),
];

// gap values as rendered inside the timeline-feed-gap span (word format, no parens)
const gapValues = (html: string) =>
  [...html.matchAll(/timeline-feed-gap">[\s\S]*?>([\dhms ]+)<\/span>/g)].map(m => m[1].trim());

const renderList = (activeFilter: 'feed' | null, feedTimerFrom?: string, historyActivities?: any[]) =>
  renderToString(
    React.createElement(TimelineV2ActivityList as any, {
      activities,
      settings: null,
      isLoading: false,
      isAnimated: false,
      selectedDate: new Date('2026-07-22T12:00:00'),
      onActivitySelect: () => {},
      activeFilter,
      allActivities: activities,
      historyActivities,
      feedTimerFrom,
      gapById: computeGapById(activities, historyActivities ?? [], feedTimerFrom === 'end' ? 'end' : 'start'),
      dividerGapById: computeDividerGapById(activities, historyActivities ?? []),
    })
  );

describe('TimelineV2ActivityList filtered feed view', () => {
  it('brackets a linked L+R session and shows the combined +/- x:yy gap when a filter is active', () => {
    const html = renderList('feed', 'end');
    expect(html).toContain('timeline-feed-session');
    // computed end inline on the first line (anchor side starts 10:00 + 8m)
    expect(html).toContain('10:00 AM - 10:08 AM');
    // sub-line: gap (history icon) + duration (timer icon), duration removed from the details line
    expect(html).toContain('timeline-feed-subline');
    expect(html).toContain('timeline-feed-duration');
    expect([...html.matchAll(/timeline-feed-duration">[\s\S]*?>([\dhms ]+)</g)].map(m => m[1].trim())).toEqual(['6m', '8m']);
    expect(html).not.toContain('Left Side • 8m');
    // suffix = gap only (duration is visible via start-end): session anchor 2:00 after 08:00; bottle 3:01 after session end 10:14
    expect(gapValues(html)).toEqual(['3h 1m', '2h 0m']);
  });

  it("anchors the gap at the previous feeding start when feedTimerFrom is 'start'", () => {
    const html = renderList('feed', 'start');
    // next bottle measured from session start 10:00 -> gap 3:15
    expect(gapValues(html)).toEqual(['3h 1m', '2h 0m']);
  });

  it('measures the first entry of a day against the last feeding of the previous day', () => {
    const dayFeeds = [feed('f1', 'BOTTLE', '2026-07-22T06:00:00.000Z')];
    const history = [feed('h1', 'BOTTLE', '2026-07-21T22:00:00.000Z')];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: dayFeeds, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T12:00:00'), onActivitySelect: () => {},
        activeFilter: 'feed', allActivities: dayFeeds, historyActivities: history, feedTimerFrom: 'start',
        gapById: computeGapById(dayFeeds, history, 'start'), dividerGapById: computeDividerGapById(dayFeeds, history),
      })
    );
    // 22:00 -> 06:00 = 8h gap, no duration on a bottle
    expect(gapValues(html)).toEqual(['8h 0m']);
  });

  it('shows +0:00-based value for the very first feeding when no history exists', () => {
    const dayFeeds = [feed('f1', 'BOTTLE', '2026-07-22T06:00:00.000Z')];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: dayFeeds, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T12:00:00'), onActivitySelect: () => {},
        activeFilter: 'feed', allActivities: dayFeeds, feedTimerFrom: 'start',
        gapById: computeGapById(dayFeeds, [], 'start'), dividerGapById: computeDividerGapById(dayFeeds, []),
      })
    );
    expect(gapValues(html)).toEqual([]);
  });

  it('shows the same (x:yy) gap+duration suffix for sleep entries when filtered', () => {
    const sleeps = [
      { id: 's1', babyId: 'b1', type: 'NAP', startTime: '2026-07-22T10:00:00.000Z', endTime: '2026-07-22T11:00:00.000Z', duration: 60 },
      { id: 's2', babyId: 'b1', type: 'NAP', startTime: '2026-07-22T14:00:00.000Z', endTime: '2026-07-22T15:30:00.000Z', duration: 90 },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: sleeps, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T18:00:00'), onActivitySelect: () => {},
        activeFilter: 'sleep', allActivities: sleeps,
        gapById: computeGapById(sleeps, [], 'start'), dividerGapById: computeDividerGapById(sleeps, []),
      })
    );
    // s2: gap from s1 end (11:00) to 14:00 = 3h -> (3:00); s1 is first of day -> (0:00)
    expect(gapValues(html)).toEqual(['3h 0m']);
    // the gap divider sits between the two sleep entries (s2 newest first), not above s2
    const iNew = html.indexOf('2:00 PM');
    const iGap = html.indexOf('3h 0m');
    const iOld = html.indexOf('10:00 AM');
    expect(iNew).toBeGreaterThan(-1);
    expect(iNew).toBeLessThan(iGap);
    expect(iGap).toBeLessThan(iOld);
    expect([...html.matchAll(/timeline-feed-duration">[\s\S]*?>([\dhms ]+)</g)].map(m => m[1].trim())).toEqual(['1h 30m', '1h 0m']);
  });

  it('treats sleep duration as minutes (21 -> "21m", not "21s")', () => {
    const sleeps = [
      { id: 's1', babyId: 'b1', type: 'NAP', startTime: '2026-07-22T10:00:00.000Z', endTime: '2026-07-22T10:21:00.000Z', duration: 21 },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: sleeps, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T12:00:00'), onActivitySelect: () => {},
        activeFilter: 'sleep', allActivities: sleeps,
        gapById: computeGapById(sleeps, [], 'start'), dividerGapById: computeDividerGapById(sleeps, []),
      })
    );
    expect([...html.matchAll(/timeline-feed-duration">[\s\S]*?>([\dhms ]+)</g)].map(m => m[1].trim())).toEqual(['21m']);
    expect(gapValues(html)).toEqual([]);
  });

  it('shows a live end time range for an ongoing sleep (no endTime)', () => {
    const sleeps = [
      { id: 's1', babyId: 'b1', type: 'NAP', startTime: '2026-07-22T10:00:00.000Z', endTime: null, duration: null },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: sleeps, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T12:00:00'), onActivitySelect: () => {},
        activeFilter: 'sleep', allActivities: sleeps,
        gapById: computeGapById(sleeps, [], 'start'), dividerGapById: computeDividerGapById(sleeps, []),
      })
    );
    // start–end range with a dash, plus live duration chip and 'Still asleep' in details
    expect(html).toMatch(/10:00 AM - \d{1,2}:\d{2} (AM|PM)/);
    expect(html).toContain('timeline-feed-duration');
  });

  it('shows gap dividers for other types (diaper) when filtered, without duration', () => {
    const diapers = [
      { id: 'd2', babyId: 'b1', type: 'WET', condition: 'WET', time: '2026-07-22T12:30:00.000Z' },
      { id: 'd1', babyId: 'b1', type: 'DIRTY', condition: 'DIRTY', time: '2026-07-22T10:00:00.000Z' },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: diapers, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T18:00:00'), onActivitySelect: () => {},
        activeFilter: 'diaper', allActivities: diapers,
      })
    );
    // start-anchored gap between the two diapers: 10:00 -> 12:30 = 2h 30m; first entry: none
    expect(gapValues(html)).toEqual(['2h 30m']);
    // the divider renders BETWEEN the two entries (newest first), not above the first one
    const iNew = html.indexOf('12:30 PM');
    const iGap = html.indexOf('2h 30m');
    const iOld = html.indexOf('10:00 AM');
    expect(iNew).toBeGreaterThan(-1);
    expect(iNew).toBeLessThan(iGap);
    expect(iGap).toBeLessThan(iOld);
  });

  it('shows the first entry of the day (oldest) with a divider to the previous same-type entry of the previous day, even with several entries today', () => {
    const diapers = [
      { id: 'd2', babyId: 'b1', type: 'WET', condition: 'WET', time: '2026-07-22T12:30:00.000Z' },
      { id: 'd1', babyId: 'b1', type: 'DIRTY', condition: 'DIRTY', time: '2026-07-22T10:00:00.000Z' },
    ];
    // last diaper of the previous day at 22:00 (hidden by the filter, not rendered)
    const history = [
      { id: 'h1', babyId: 'b1', type: 'WET', condition: 'WET', time: '2026-07-21T22:00:00.000Z' },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: diapers, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T18:00:00'), onActivitySelect: () => {},
        activeFilter: 'diaper', allActivities: diapers, historyActivities: history,
      })
    );
    // the oldest diaper (10:00) shows the cross-midnight gap (22:00 -> 10:00 = 12h),
    // not the between-entry gap (10:00 -> 12:30 = 2h 30m)
    expect(gapValues(html)).toEqual(['12h 0m']);
    // the previous day's diaper (22:00) is rendered below the divider, dimmed, with its date
    expect(html).toContain('timeline-previous-entry');
    const iGap = html.indexOf('12h 0m');
    const iOld = html.indexOf('10:00 AM');
    const iPrev = html.indexOf('Jul 21 10:00 PM');
    expect(iOld).toBeGreaterThan(-1);
    expect(iGap).toBeGreaterThan(-1);
    expect(iPrev).toBeGreaterThan(-1);
    expect(iOld).toBeLessThan(iGap);
    expect(iGap).toBeLessThan(iPrev);
  });

  it('shows the first diaper of the day with a divider to the last diaper of the previous day', () => {
    const diapers = [
      { id: 'd1', babyId: 'b1', type: 'WET', condition: 'WET', time: '2026-07-22T10:00:00.000Z' },
    ];
    const history = [
      { id: 'h1', babyId: 'b1', type: 'WET', condition: 'WET', time: '2026-07-21T22:00:00.000Z' },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: diapers, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T18:00:00'), onActivitySelect: () => {},
        activeFilter: 'diaper', allActivities: diapers, historyActivities: history,
      })
    );
    // 22:00 ( Vortag ) -> 10:00 = 12h gap on the first entry of the day
    expect(gapValues(html)).toEqual(['12h 0m']);
  });

  it('shows the first sleep of the day with a divider to the last sleep of the previous day', () => {
    const sleeps = [
      { id: 's1', babyId: 'b1', type: 'NAP', startTime: '2026-07-22T10:00:00.000Z', endTime: '2026-07-22T11:00:00.000Z', duration: 60 },
    ];
    const history = [
      { id: 'h1', babyId: 'b1', type: 'NAP', startTime: '2026-07-21T22:00:00.000Z', endTime: '2026-07-21T23:30:00.000Z', duration: 90 },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: sleeps, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T18:00:00'), onActivitySelect: () => {},
        activeFilter: 'sleep', allActivities: sleeps, historyActivities: history,
        gapById: computeGapById(sleeps, history, 'start'), dividerGapById: computeDividerGapById(sleeps, history),
      })
    );
    // end-anchored: 10:00 minus previous sleep end 23:30 = 10h 30m
    expect(gapValues(html)).toEqual(['10h 30m']);
  });

  it('renders the session bracket without a filter, but no gap dividers', () => {
    const html = renderList(null);
    expect(html).toContain('timeline-feed-session');
    expect(gapValues(html)).toEqual([]);
  });

  it('shows the first feed of the day with a divider to the previous feed of the previous day', () => {
    const feeds = [
      { id: 'f2', babyId: 'b1', type: 'BOTTLE', time: '2026-07-22T14:00:00.000Z', amount: 100 },
      { id: 'f1', babyId: 'b1', type: 'BOTTLE', time: '2026-07-22T08:00:00.000Z', amount: 90 },
    ];
    // last feed of the previous day at 23:00 (the previous day's last entry was a sleep,
    // but the feed filter must anchor at the previous FEED, not at that sleep)
    const historyFeeds = [
      { id: 'hf', babyId: 'b1', type: 'BOTTLE', time: '2026-07-21T23:00:00.000Z', amount: 80 },
    ];
    const history = [
      ...historyFeeds,
      { id: 'hs', babyId: 'b1', type: 'NIGHT', startTime: '2026-07-21T23:30:00.000Z', endTime: '2026-07-22T01:00:00.000Z', duration: 90 },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: feeds, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T18:00:00'), onActivitySelect: () => {},
        activeFilter: 'feed', allActivities: feeds, historyActivities: history,
        feedTimerFrom: 'start', gapById: new Map(), dividerGapById: computeDividerGapById(feeds, historyFeeds),
      })
    );
    // oldest feed (08:00) anchors at the previous feed (yesterday 23:00 -> 9h), not at the later sleep
    expect(gapValues(html)).toEqual(['9h 0m']);
    // the previous feed (23:00) is rendered below the divider, dimmed, with its date
    expect(html).toContain('timeline-previous-entry');
    const iGap = html.indexOf('9h 0m');
    const iOldest = html.indexOf('8:00 AM');
    const iPrev = html.indexOf('Jul 21 11:00 PM');
    expect(iOldest).toBeGreaterThan(-1);
    expect(iGap).toBeGreaterThan(-1);
    expect(iPrev).toBeGreaterThan(-1);
    expect(iOldest).toBeLessThan(iGap);
    expect(iGap).toBeLessThan(iPrev);
  });

  it('anchors the first-of-day divider at the previous same-type entry from deep history when the previous day has none of that type', () => {
    const diapers = [
      { id: 'd2', babyId: 'b1', type: 'WET', condition: 'WET', time: '2026-07-22T12:30:00.000Z' },
      { id: 'd1', babyId: 'b1', type: 'DIRTY', condition: 'DIRTY', time: '2026-07-22T10:00:00.000Z' },
    ];
    // yesterday (+/-1 day window) only has a sleep and a feed — no diaper
    const history = [
      { id: 'hSleep', babyId: 'b1', type: 'NIGHT', startTime: '2026-07-21T22:00:00.000Z', endTime: '2026-07-21T23:30:00.000Z', duration: 90 },
      { id: 'hFeed', babyId: 'b1', type: 'BOTTLE', time: '2026-07-21T20:00:00.000Z', amount: 80 },
    ];
    // deep history: last diaper was two days ago at 20:00
    const filterHistory = [
      { id: 'hDiaper', babyId: 'b1', type: 'WET', condition: 'WET', time: '2026-07-20T20:00:00.000Z' },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: diapers, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T18:00:00'), onActivitySelect: () => {},
        activeFilter: 'diaper', allActivities: [...diapers, ...history], historyActivities: history,
        filterHistory,
      })
    );
    // oldest diaper (today 10:00) anchors at the diaper from two days ago (20:00 -> 38h)
    expect(gapValues(html)).toEqual(['38h 0m']);
    // the deep-history diaper (two days ago, 20:00) is rendered below the divider, with its date
    expect(html).toContain('timeline-previous-entry');
    const iGap = html.indexOf('38h 0m');
    const iOld = html.indexOf('10:00 AM');
    const iPrev = html.indexOf('Jul 20 8:00 PM');
    expect(iOld).toBeGreaterThan(-1);
    expect(iGap).toBeGreaterThan(-1);
    expect(iPrev).toBeGreaterThan(-1);
    expect(iOld).toBeLessThan(iGap);
    expect(iGap).toBeLessThan(iPrev);
  });

  it('does not render the previous entry when showPreviousEntry is disabled (divider stays above the oldest entry)', () => {
    const diapers = [
      { id: 'd1', babyId: 'b1', type: 'WET', condition: 'WET', time: '2026-07-22T10:00:00.000Z' },
    ];
    const history = [
      { id: 'h1', babyId: 'b1', type: 'WET', condition: 'WET', time: '2026-07-21T22:00:00.000Z' },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: diapers, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T18:00:00'), onActivitySelect: () => {},
        activeFilter: 'diaper', allActivities: diapers, historyActivities: history,
        showPreviousEntry: false,
      })
    );
    expect(gapValues(html)).toEqual(['12h 0m']);
    expect(html).not.toContain('timeline-previous-entry');
    expect(html).not.toContain('10:00 PM');
    const iGap = html.indexOf('12h 0m');
    const iOld = html.indexOf('10:00 AM');
    expect(iGap).toBeGreaterThan(-1);
    expect(iGap).toBeLessThan(iOld);
  });

  it('does not render the previous entry without an active filter, even when history exists', () => {
    const acts = [
      { id: 'd1', babyId: 'b1', type: 'WET', condition: 'WET', time: '2026-07-22T10:00:00.000Z' },
    ];
    const history = [
      { id: 'h1', babyId: 'b1', type: 'WET', condition: 'WET', time: '2026-07-21T22:00:00.000Z' },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: acts, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T18:00:00'), onActivitySelect: () => {},
        activeFilter: null, allActivities: acts, historyActivities: history, filterHistory: history,
      })
    );
    expect(gapValues(html)).toEqual(['12h 0m']);
    expect(html).not.toContain('timeline-previous-entry');
  });

  it('shows the first-of-day divider also without a filter, anchored at the previous entry of any type', () => {
    // oldest entry of the day is a NAP starting 00:26Z today
    const acts = [
      { id: 'd2', babyId: 'b1', type: 'WET', condition: 'WET', time: '2026-07-22T12:30:00.000Z' },
      { id: 'nap0', babyId: 'b1', type: 'NAP', startTime: '2026-07-22T00:26:00.000Z', endTime: '2026-07-22T03:12:00.000Z', duration: 166 },
    ];
    // deep history (all types, no filter): last entry before the day was a feed at 23:59Z yesterday
    const filterHistory = [
      { id: 'hf', babyId: 'b1', type: 'BREAST', time: '2026-07-21T23:59:00.000Z', startTime: '2026-07-21T23:59:00.000Z', endTime: '2026-07-22T00:09:00.000Z', feedDuration: 600, amount: null },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: acts, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T18:00:00'), onActivitySelect: () => {},
        activeFilter: null, allActivities: acts, filterHistory,
      })
    );
    // NAP anchors at its start (00:26Z); previous entry 23:59Z -> 27m, divider above the NAP
    expect(gapValues(html)).toEqual(['27m']);
    const iGap = html.indexOf('27m');
    const iNap = html.indexOf('12:26 AM'); // 00:26Z in 12h format (test env TZ=UTC)
    expect(iGap).toBeGreaterThan(-1);
    expect(iGap).toBeLessThan(iNap);
  });

  it('omits the date on the side of an overnight sleep that is today', () => {
    // end = today 00:12, start = yesterday 21:26
    const end = new Date(); end.setHours(0, 12, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - 1); start.setHours(21, 26, 0, 0);
    const sleeps = [
      { id: 's1', babyId: 'b1', type: 'NIGHT', startTime: start.toISOString(), endTime: end.toISOString(), duration: 166 },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: sleeps, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date(), onActivitySelect: () => {},
        activeFilter: 'sleep', allActivities: sleeps,
        gapById: new Map(), dividerGapById: new Map(),
      })
    );
    // start keeps its date (yesterday), end shows time only (today): "9:26 PM - 12:12 AM"
    expect(html).toContain('9:26 PM - 12:12 AM');
    expect(html).not.toContain(`${formatDateShort(end, 'MM/DD/YYYY')} 12:12 AM`);
  });

  it('keeps both dates for an overnight sleep when neither side is today', () => {
    const sleeps = [
      { id: 's1', babyId: 'b1', type: 'NIGHT', startTime: '2026-07-21T21:26:00.000Z', endTime: '2026-07-22T00:12:00.000Z', duration: 166 },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: sleeps, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T12:00:00'), onActivitySelect: () => {},
        activeFilter: 'sleep', allActivities: sleeps,
        gapById: new Map(), dividerGapById: new Map(),
      })
    );
    expect(html).toContain(`${formatDateShort(new Date('2026-07-21T21:26:00.000Z'), 'MM/DD/YYYY')} 9:26 PM - ${formatDateShort(new Date('2026-07-22T00:12:00.000Z'), 'MM/DD/YYYY')} 12:12 AM`);
  });
});
