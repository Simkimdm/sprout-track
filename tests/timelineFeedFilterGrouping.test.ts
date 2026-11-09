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
import { buildFeedGapMap, buildGapMap, FeedGapInfo, FeedGapRow } from '@/src/utils/feedSessionUtils';

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
    })
  );

describe('TimelineV2ActivityList filtered feed view', () => {
  it('brackets a linked L+R session and shows the combined +/- x:yy gap when a filter is active', () => {
    const html = renderList('feed', 'end');
    expect(html).toContain('timeline-feed-session-bracket');
    // computed end inline on the first line (anchor side starts 10:00 + 8m)
    expect(html).toContain('10:00 AM–10:08 AM');
    // sub-line: gap (history icon) + duration (timer icon), duration removed from the details line
    expect(html).toContain('timeline-feed-subline');
    expect(html).toContain('timeline-feed-duration');
    expect([...html.matchAll(/timeline-feed-duration">[\s\S]*?>([\dhms ]+)</g)].map(m => m[1].trim())).toEqual(['6m', '8m']);
    expect(html).not.toContain('Left Side • 8m');
    // suffix = gap only (duration is visible via start-end): session anchor 2:00 after 08:00; bottle 3:01 after session end 10:14
    expect(gapValues(html)).toEqual(['3h 1m', '0s', '2h 0m', '0s']);
  });

  it("anchors the gap at the previous feeding start when feedTimerFrom is 'start'", () => {
    const html = renderList('feed', 'start');
    // next bottle measured from session start 10:00 -> gap 3:15
    expect(gapValues(html)).toEqual(['3h 7m', '8m', '2h 0m', '0s']);
  });

  it('measures the first entry of a day against the last feeding of the previous day', () => {
    const dayFeeds = [feed('f1', 'BOTTLE', '2026-07-22T06:00:00.000Z')];
    const history = [feed('h1', 'BOTTLE', '2026-07-21T22:00:00.000Z')];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: dayFeeds, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T12:00:00'), onActivitySelect: () => {},
        activeFilter: 'feed', allActivities: dayFeeds, historyActivities: history, feedTimerFrom: 'start',
        gapById: computeGapById(dayFeeds, history, 'start'),
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
        gapById: computeGapById(dayFeeds, [], 'start'),
      })
    );
    expect(gapValues(html)).toEqual(['0s']);
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
        gapById: computeGapById(sleeps, [], 'start'),
      })
    );
    // s2: gap from s1 end (11:00) to 14:00 = 3h -> (3:00); s1 is first of day -> (0:00)
    expect(gapValues(html)).toEqual(['3h 0m', '0s']);
    expect([...html.matchAll(/timeline-feed-duration">[\s\S]*?>([\dhms ]+)</g)].map(m => m[1].trim())).toEqual(['1h 30m', '1h 0m']);
  });

  it('treats sleep duration as minutes (21 -> "21m", not "21s")', () => {
    const sleeps = [
      { id: 's1', babyId: 'b1', type: 'NAP', startTime: '2026-07-22T10:00:00.000Z', endTime: null, duration: 21 },
    ];
    const html = renderToString(
      React.createElement(TimelineV2ActivityList as any, {
        activities: sleeps, settings: null, isLoading: false, isAnimated: false,
        selectedDate: new Date('2026-07-22T12:00:00'), onActivitySelect: () => {},
        activeFilter: 'sleep', allActivities: sleeps,
        gapById: computeGapById(sleeps, [], 'start'),
      })
    );
    expect([...html.matchAll(/timeline-feed-duration">[\s\S]*?>([\dhms ]+)</g)].map(m => m[1].trim())).toEqual(['21m']);
    expect(gapValues(html)).toEqual(['0s']);
  });

  it('renders bracket and gap by default, even without an active filter', () => {
    const html = renderList(null);
    expect(html).toContain('timeline-feed-session-bracket');
    expect(gapValues(html)).toEqual(['3h 7m', '8m', '2h 0m', '0s']);
  });
});
