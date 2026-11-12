import { describe, it, expect } from 'vitest';
import { matchesFilterType } from '@/src/components/Timeline/utils';

describe('matchesFilterType', () => {
  const feed = { id: 'f', babyId: 'b', type: 'BOTTLE', time: '2026-07-22T10:00:00.000Z', amount: 100 };
  const solidsFeed = { id: 's', babyId: 'b', type: 'SOLIDS', time: '2026-07-22T10:00:00.000Z', amount: 5 };
  const wet = { id: 'w', babyId: 'b', type: 'WET', condition: 'WET', time: '2026-07-22T10:00:00.000Z' };
  const poop = { id: 'p', babyId: 'b', type: 'DIRTY', condition: 'DIRTY', time: '2026-07-22T10:00:00.000Z' };
  const sleep = { id: 'sl', babyId: 'b', type: 'NAP', startTime: '2026-07-22T10:00:00.000Z', duration: 30 };
  const note = { id: 'n', babyId: 'b', content: 'x', time: '2026-07-22T10:00:00.000Z' };
  const foodLog = { id: 'fd', babyId: 'b', foodId: 'food1', time: '2026-07-22T10:00:00.000Z' };

  it('matches feed but not SOLIDS rows or food logs', () => {
    expect(matchesFilterType(feed as any, 'feed')).toBe(true);
    expect(matchesFilterType(solidsFeed as any, 'feed')).toBe(false);
    expect(matchesFilterType(foodLog as any, 'feed')).toBe(false);
    expect(matchesFilterType(foodLog as any, 'food')).toBe(true);
  });

  it('distinguishes wet and poop diapers', () => {
    expect(matchesFilterType(wet as any, 'diaper')).toBe(true);
    expect(matchesFilterType(wet as any, 'wet')).toBe(true);
    expect(matchesFilterType(wet as any, 'poop')).toBe(false);
    expect(matchesFilterType(poop as any, 'poop')).toBe(true);
    expect(matchesFilterType(poop as any, 'wet')).toBe(false);
  });

  it('matches sleep and note by their unique fields', () => {
    expect(matchesFilterType(sleep as any, 'sleep')).toBe(true);
    expect(matchesFilterType(note as any, 'sleep')).toBe(false);
    expect(matchesFilterType(note as any, 'note')).toBe(true);
    expect(matchesFilterType(sleep as any, 'note')).toBe(false);
  });

  it('returns true for null/unknown filters', () => {
    expect(matchesFilterType(feed as any, null)).toBe(true);
    expect(matchesFilterType(note as any, 'calendar')).toBe(true);
  });
});
