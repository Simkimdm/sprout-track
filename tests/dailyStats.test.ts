import { describe, expect, it } from 'vitest';
import {
  computeDailyStats,
  computeDayTrend,
  DailyStatMetrics,
  HistoryDayStats,
  TREND_HISTORY_DAYS,
  TREND_SPARK_DAYS,
} from '@/src/utils/dailyStats';
import { convertVolume } from '@/src/utils/unit-conversion';

const t = (key: string) => key;
const unitSymbol = (abbr: string) => abbr.toLowerCase();
const opts = { t, unitSymbol };

const DAY = new Date(2026, 6, 15, 12, 0, 0); // local 2026-07-15 12:00
const at = (h: number, m = 0) => new Date(2026, 6, 15, h, m).toISOString();

const baseMetrics = (overrides: Partial<DailyStatMetrics> = {}): DailyStatMetrics => ({
  ...computeDailyStats([], undefined, DAY, { ...opts, now: DAY }),
  ...overrides,
});

const historyDay = (dayOffset: number, metrics: DailyStatMetrics, hasData = true): HistoryDayStats => ({
  date: new Date(2026, 6, 15 - dayOffset),
  hasData,
  metrics,
});

describe('computeDailyStats', () => {
  it('counts diaper changes and splits wet/poop (BOTH counts as both)', () => {
    const activities = [
      { id: '1', time: at(8), type: 'WET', condition: 'x' },
      { id: '2', time: at(10), type: 'DIRTY', condition: 'x' },
      { id: '3', time: at(12), type: 'BOTH', condition: 'x' },
      { id: '4', time: at(14), type: 'DRY', condition: 'x' },
    ];
    const stats = computeDailyStats(activities, undefined, DAY, { ...opts, now: DAY });
    expect(stats.diaperCount).toBe(4);
    expect(stats.wetCount).toBe(2);
    expect(stats.poopCount).toBe(2);
  });

  it('counts only the overlap of an overnight sleep with the day', () => {
    const activities = [
      {
        id: 's1',
        type: 'NIGHT_SLEEP',
        startTime: new Date(2026, 6, 14, 23, 0).toISOString(),
        endTime: new Date(2026, 6, 15, 1, 30).toISOString(),
        duration: 150,
      },
    ];
    const stats = computeDailyStats(activities, undefined, DAY, { ...opts, now: DAY });
    expect(stats.totalSleepMinutes).toBe(90);
  });

  it('extends an ongoing sleep up to now on today, up to end of day on past days', () => {
    const ongoing = [
      { id: 's1', type: 'NAP', startTime: at(10), duration: 120 },
    ];
    const today = computeDailyStats(ongoing, undefined, DAY, { ...opts, now: new Date(2026, 6, 15, 12, 0) });
    expect(today.totalSleepMinutes).toBe(120);
    expect(today.isToday).toBe(true);
    expect(today.awakeMinutes).toBe(12 * 60 - 120);

    const pastOngoing = [
      { id: 's1', type: 'NAP', startTime: new Date(2026, 6, 14, 10, 0).toISOString(), duration: 120 },
    ];
    const past = computeDailyStats(pastOngoing, undefined, new Date(2026, 6, 14), { ...opts, now: new Date(2026, 6, 15, 12, 0) });
    expect(past.isToday).toBe(false);
    // ongoing sleep on a past day counts up to end of that day (10:00 -> 23:59 = 839 min)
    expect(past.totalSleepMinutes).toBe(13 * 60 + 59);
    expect(past.awakeMinutes).toBe(24 * 60 - 1 - (13 * 60 + 59));
  });

  it('converts pump totals into the preferred unit', () => {
    const activities = [
      { id: 'p1', startTime: at(9), leftAmount: 2, totalAmount: 4, unitAbbr: 'OZ' },
    ];
    const stats = computeDailyStats(activities, undefined, DAY, { ...opts, now: DAY, defaultBottleUnit: 'ML' });
    expect(stats.pumpCount).toBe(1);
    expect(stats.pumpTotal).toBeCloseTo(convertVolume(4, 'OZ', 'ML'), 6);
    expect(stats.preferredUnit).toBe('ML');
  });

  it('counts bottle feeds and food logs via aggregateFeedStats', () => {
    const activities = [
      { id: 'f1', time: at(8), type: 'BOTTLE', amount: 100, unitAbbr: 'ML' },
      { id: 'f2', time: at(11), type: 'BOTTLE', amount: 80, unitAbbr: 'ML' },
      { id: 'food1', foodId: 'apple', time: at(13) },
    ];
    const stats = computeDailyStats(activities, undefined, DAY, { ...opts, now: DAY, defaultBottleUnit: 'ML' });
    expect(stats.milkFeedCount).toBe(2);
    expect(stats.bottleFeedTotal).toBeCloseTo(180, 6);
    expect(stats.solidsCount).toBe(1);
  });

  it('aggregates medicine and supplement doses into a total count', () => {
    const activities = [
      { id: 'm1', time: at(8), doseAmount: 5, medicineId: 'med1', unitAbbr: 'ML', medicine: { name: 'Vitamin D', isSupplement: false } },
      { id: 'm2', time: at(20), doseAmount: 2, medicineId: 'med2', unitAbbr: 'DROP', medicine: { name: 'Iron', isSupplement: true } },
    ];
    const stats = computeDailyStats(activities, undefined, DAY, { ...opts, now: DAY });
    expect(stats.medicineStats['Vitamin D']).toEqual({ count: 1, total: 5, unit: 'ml' });
    expect(stats.supplementStats['Iron'].count).toBe(1);
    expect(stats.medicineTotalCount).toBe(2);
  });

  it('ignores entries outside the selected day', () => {
    const activities = [
      { id: '1', time: new Date(2026, 6, 14, 10).toISOString(), type: 'WET', condition: 'x' },
      { id: '2', time: at(9), type: 'WET', condition: 'x' },
    ];
    const stats = computeDailyStats(activities, undefined, DAY, { ...opts, now: DAY });
    expect(stats.diaperCount).toBe(1);
  });
});

describe('computeDayTrend', () => {
  const days = (values: (number | null)[], key: 'diaperCount' | 'totalSleepMinutes' = 'diaperCount'): HistoryDayStats[] =>
    values.map((v, i) => historyDay(values.length - i, baseMetrics({ [key]: v ?? 0 }), v !== null));

  it('returns null when there is no history at all', () => {
    expect(computeDayTrend(baseMetrics({ diaperCount: 5 }), [], 'diaperCount')).toBeNull();
  });

  it('returns null when no history day has any data', () => {
    const history = days(Array(TREND_SPARK_DAYS).fill(null));
    expect(computeDayTrend(baseMetrics({ diaperCount: 5 }), history, 'diaperCount')).toBeNull();
  });

  it('averages only the last 7 days with data, rounds to 1 decimal, flags an increase', () => {
    // 14 history days; only the last 7 count for the average, yesterday = 6
    const history = days([...Array(7).fill(100), 4, 4, 4, 4, 4, 4, 6]);
    const trend = computeDayTrend(baseMetrics({ diaperCount: 8 }), history, 'diaperCount');
    expect(trend).not.toBeNull();
    expect(trend!.avg).toBe(4.3); // 30/7 rounded to 1 decimal
    expect(trend!.avgDays).toBe(TREND_HISTORY_DAYS);
    expect(trend!.yesterday).toBe(6);
    expect(trend!.dir).toBe('up');
    expect(trend!.absDelta).toBe(3.7);
    expect(trend!.pctDelta).toBeCloseTo((3.7 / 4.3) * 100, 6);
  });

  it('skips data-less days in the average but keeps them as zero in the sparkline', () => {
    const history = days([...Array(TREND_SPARK_DAYS - 1).fill(null), 6]);
    const trend = computeDayTrend(baseMetrics({ diaperCount: 8 }), history, 'diaperCount');
    expect(trend!.avg).toBe(6);
    expect(trend!.avgDays).toBe(1);
    expect(trend!.yesterday).toBe(6);
    expect(trend!.spark).toHaveLength(TREND_SPARK_DAYS);
    expect(trend!.spark[TREND_SPARK_DAYS - 1]).toBe(8); // today is the last bar
    expect(trend!.spark[TREND_SPARK_DAYS - 2]).toBe(6); // yesterday
    expect(trend!.spark[0]).toBe(0); // data-less day renders as an empty bar
  });

  it('treats small deviations as flat (≈)', () => {
    const history = days(Array(TREND_SPARK_DAYS).fill(10));
    const flat = computeDayTrend(baseMetrics({ diaperCount: 10 }), history, 'diaperCount');
    expect(flat!.dir).toBe('flat');
    expect(flat!.absDelta).toBe(0);

    const small = computeDayTrend(baseMetrics({ diaperCount: 10.5 }), history, 'diaperCount');
    expect(small!.dir).toBe('flat'); // +5% < 10% threshold
    expect(small!.pctDelta).toBeCloseTo(5, 6);
  });

  it('flags a decrease and handles a zero average (pct undefined)', () => {
    const history = days(Array(TREND_SPARK_DAYS).fill(8));
    const down = computeDayTrend(baseMetrics({ diaperCount: 4 }), history, 'diaperCount');
    expect(down!.dir).toBe('down');
    expect(down!.pctDelta).toBeCloseTo(-50, 6);

    const zeroHistory = days(Array(TREND_SPARK_DAYS).fill(0));
    const fromZero = computeDayTrend(baseMetrics({ diaperCount: 3 }), zeroHistory, 'diaperCount');
    expect(fromZero!.dir).toBe('up');
    expect(fromZero!.pctDelta).toBeNull();
    expect(fromZero!.absDelta).toBe(3);
  });

  it('reads any numeric metric key', () => {
    const history = days(Array(TREND_SPARK_DAYS).fill(60), 'totalSleepMinutes');
    const trend = computeDayTrend(baseMetrics({ totalSleepMinutes: 90 }), history, 'totalSleepMinutes');
    expect(trend!.dir).toBe('up');
    expect(trend!.absDelta).toBe(30);
  });
});
