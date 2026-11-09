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

const renderList = (activeFilter: 'feed' | null) =>
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
    })
  );

describe('TimelineV2ActivityList filtered feed view', () => {
  it('brackets a linked L+R session and shows the combined +/- x:yy gap when a filter is active', () => {
    const html = renderList('feed');
    expect(html).toContain('timeline-feed-session-bracket');
    // session anchor (earliest side): gap from session start 10:00 -> 2:00 + duration 0:14 = (+2:14); next bottle measured from session start: 3:15
    expect(html.match(/\(\+\d+:\d{2}\)/g)).toEqual(['(+3:15)', '(+2:14)']);
  });

  it('renders no bracket and no gap without an active filter', () => {
    const html = renderList(null);
    expect(html).not.toContain('timeline-feed-session-bracket');
    expect(html).not.toMatch(/\(\+\d+:\d{2}\)/);
  });
});
