import { aggregateFeedStats, FeedStats } from './feedStatsUtils';
import { convertVolume } from './unit-conversion';
import { countUniquePhotoIds } from './photoUtils';
import { isDirtyDiaper, isWetDiaper } from './diaperStats';

export interface DailyStatsOptions {
  defaultBottleUnit?: string;
  unitSymbol: (unitAbbr: string) => string;
  t: (key: string) => string;
  now?: Date;
}

export interface DailyStatMetrics {
  awakeMinutes: number;
  totalSleepMinutes: number;
  diaperCount: number;
  wetCount: number;
  dirtyCount: number;
  poopCount: number;
  medicineStats: Record<string, { count: number; total: number; unit: string }>;
  supplementStats: Record<string, { count: number; total: number; unit: string }>;
  medicineTotalCount: number;
  noteCount: number;
  bathCount: number;
  pumpCount: number;
  pumpTotal: number;
  milestoneCount: number;
  measurementCount: number;
  playCount: number;
  totalPlayMinutes: number;
  vaccineCount: number;
  photoCount: number;
  feedStats: FeedStats;
  milkFeedCount: number;
  bottleFeedTotal: number;
  leftBreastMinutes: number;
  rightBreastMinutes: number;
  breastFeedMinutes: number;
  solidsCount: number;
  preferredUnit: string;
  isToday: boolean;
}

export type MetricKey = {
  [K in keyof DailyStatMetrics]: DailyStatMetrics[K] extends number ? K : never;
}[keyof DailyStatMetrics];

const PLAY_TYPES = ['TUMMY_TIME', 'INDOOR_PLAY', 'OUTDOOR_PLAY', 'WALK', 'CUSTOM'];

export function computeDailyStats(
  activities: any[],
  windowActivities: any[] | undefined,
  date: Date,
  opts: DailyStatsOptions
): DailyStatMetrics {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  let totalSleepMinutes = 0;
  let diaperCount = 0;
  let wetCount = 0;
  let dirtyCount = 0;
  let poopCount = 0;
  const preferredUnit = opts.defaultBottleUnit || 'OZ';
  const medicineStats: Record<string, { count: number; total: number; unit: string }> = {};
  const supplementStats: Record<string, { count: number; total: number; unit: string }> = {};
  let noteCount = 0;
  let bathCount = 0;
  let pumpCount = 0;
  let pumpTotal = 0;
  let milestoneCount = 0;
  let measurementCount = 0;
  let playCount = 0;
  let totalPlayMinutes = 0;
  let vaccineCount = 0;
  let awakeMinutes = 0;

  activities.forEach(activity => {
    if ('foodId' in activity) {
      return;
    }

    if ('activities' in activity && 'type' in activity && PLAY_TYPES.includes((activity as any).type)) {
      const time = new Date((activity as any).startTime);
      if (time >= startOfDay && time <= endOfDay) {
        playCount++;
        if ((activity as any).duration) {
          totalPlayMinutes += (activity as any).duration;
        }
      }
      return;
    }

    if ('duration' in activity && 'startTime' in activity &&
        'type' in activity &&
        !('leftAmount' in activity || 'rightAmount' in activity)) {
      const startTime = new Date(activity.startTime);
      const endTime = 'endTime' in activity && activity.endTime ? new Date(activity.endTime) : null;

      if (endTime) {
        const overlapStart = Math.max(startTime.getTime(), startOfDay.getTime());
        const overlapEnd = Math.min(endTime.getTime(), endOfDay.getTime());

        if (overlapEnd > overlapStart) {
          const overlapMinutes = Math.floor((overlapEnd - overlapStart) / (1000 * 60));
          totalSleepMinutes += overlapMinutes;
        }
      }
    }

    if ('condition' in activity && 'type' in activity) {
      const time = new Date(activity.time);
      if (time >= startOfDay && time <= endOfDay) {
        diaperCount++;
        if (isWetDiaper(activity.type)) {
          wetCount++;
        }
        if (isDirtyDiaper(activity.type)) {
          dirtyCount++;
          poopCount++;
        }
      }
    }

    if ('doseAmount' in activity && 'medicineId' in activity) {
      const time = new Date(activity.time);
      if (time >= startOfDay && time <= endOfDay) {
        const isSupplement = 'medicine' in activity && activity.medicine && typeof activity.medicine === 'object' && 'isSupplement' in activity.medicine && (activity.medicine as any).isSupplement;
        const targetStats = isSupplement ? supplementStats : medicineStats;

        let medicineName = opts.t('unknown');
        if ('medicine' in activity && activity.medicine && typeof activity.medicine === 'object' && 'name' in activity.medicine) {
          medicineName = (activity.medicine as { name?: string }).name || medicineName;
        }

        if (!targetStats[medicineName]) {
          targetStats[medicineName] = {
            count: 0,
            total: 0,
            unit: opts.unitSymbol(activity.unitAbbr)
          };
        }

        targetStats[medicineName].count += 1;
        if (activity.doseAmount && typeof activity.doseAmount === 'number') {
          targetStats[medicineName].total += activity.doseAmount;
        }
      }
    }

    if ('content' in activity) {
      const time = new Date(activity.time);
      if (time >= startOfDay && time <= endOfDay) {
        noteCount++;
      }
    }

    if ('soapUsed' in activity) {
      const time = new Date(activity.time);
      if (time >= startOfDay && time <= endOfDay) {
        bathCount++;
      }
    }

    if ('leftAmount' in activity || 'rightAmount' in activity) {
      let time: Date | null = null;
      if ('startTime' in activity && activity.startTime) {
        time = new Date(activity.startTime);
      } else if ('time' in activity && activity.time) {
        time = new Date(activity.time);
      }
      if (time && time >= startOfDay && time <= endOfDay) {
        pumpCount++;
        const total = (activity as any).totalAmount || 0;
        if (total > 0) {
          const entryUnit = (activity as any).unitAbbr || 'OZ';
          pumpTotal += convertVolume(total, entryUnit, preferredUnit);
        }
      }
    }

    if ('vaccineName' in activity) {
      const time = new Date((activity as any).time);
      if (time >= startOfDay && time <= endOfDay) {
        vaccineCount++;
      }
      return;
    }

    if ('title' in activity && 'category' in activity) {
      const activityDate = new Date(activity.date);
      if (activityDate >= startOfDay && activityDate <= endOfDay) {
        milestoneCount++;
      }
    }

    if ('value' in activity && 'unit' in activity) {
      const activityDate = new Date(activity.date);
      if (activityDate >= startOfDay && activityDate <= endOfDay) {
        measurementCount++;
      }
    }
  });

  const feedStats = aggregateFeedStats(activities, windowActivities, startOfDay, endOfDay, preferredUnit);

  const now = opts.now ?? new Date();
  const isToday = date.toDateString() === now.toDateString();

  const activeSleep = activities.find(activity =>
    'duration' in activity &&
    'startTime' in activity &&
    'type' in activity &&
    !('leftAmount' in activity || 'rightAmount' in activity) &&
    !('endTime' in activity && activity.endTime) &&
    new Date(activity.startTime) >= startOfDay &&
    new Date(activity.startTime) <= endOfDay
  );

  if (activeSleep && 'startTime' in activeSleep && activeSleep.startTime) {
    const startTime = new Date(activeSleep.startTime);
    const endTime = isToday ? now : endOfDay;
    const activeSleepMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60));
    if (activeSleepMinutes > 0) {
      totalSleepMinutes += activeSleepMinutes;
    }
  }

  const referenceTime = isToday ? now : endOfDay;

  const elapsedMinutes = Math.floor((referenceTime.getTime() - startOfDay.getTime()) / (1000 * 60));
  awakeMinutes = Math.max(0, elapsedMinutes - totalSleepMinutes);

  const photoCount = countUniquePhotoIds(activities as { photos?: { id: string }[] }[]);

  const medicineTotalCount =
    Object.values(medicineStats).reduce((sum, v) => sum + v.count, 0) +
    Object.values(supplementStats).reduce((sum, v) => sum + v.count, 0);

  return {
    awakeMinutes,
    totalSleepMinutes,
    diaperCount,
    wetCount,
    dirtyCount,
    poopCount,
    medicineStats,
    supplementStats,
    medicineTotalCount,
    noteCount,
    bathCount,
    pumpCount,
    pumpTotal,
    milestoneCount,
    measurementCount,
    playCount,
    totalPlayMinutes,
    vaccineCount,
    photoCount,
    feedStats,
    milkFeedCount: feedStats.milkFeedCount,
    bottleFeedTotal: feedStats.bottleFeedTotal,
    leftBreastMinutes: feedStats.leftBreastMinutes,
    rightBreastMinutes: feedStats.rightBreastMinutes,
    breastFeedMinutes: feedStats.leftBreastMinutes + feedStats.rightBreastMinutes,
    solidsCount: feedStats.solidsCount,
    preferredUnit,
    isToday,
  };
}

export interface HistoryDayStats {
  date: Date;
  hasData: boolean;
  metrics: DailyStatMetrics;
}

export interface DayTrend {
  dir: 'up' | 'down' | 'flat';
  absDelta: number;
  pctDelta: number | null;
  avg: number;
  avgDays: number;
  yesterday: number | null;
  /** Same comparison against yesterday instead of the average (null when yesterday has no data). */
  yDir: 'up' | 'down' | 'flat' | null;
  yAbsDelta: number | null;
  yPctDelta: number | null;
  spark: number[];
}

export const TREND_HISTORY_DAYS = 7;
export const TREND_SPARK_DAYS = 14;
export const TREND_FLAT_PCT = 10;

export function computeDayTrend(
  today: DailyStatMetrics,
  historyDays: HistoryDayStats[],
  key: MetricKey
): DayTrend | null {
  if (historyDays.length === 0) return null;
  const values = historyDays.map((d) => (d.hasData ? d.metrics[key] : null));
  const used = values.slice(-TREND_HISTORY_DAYS).filter((v): v is number => v !== null);
  if (used.length === 0) return null;
  const avg = Math.round((used.reduce((sum, v) => sum + v, 0) / used.length) * 10) / 10;
  const todayValue = today[key];
  const absDelta = Math.round((todayValue - avg) * 10) / 10;
  const pctDelta = avg !== 0 ? (absDelta / avg) * 100 : null;
  const flat = pctDelta === null ? absDelta === 0 : Math.abs(pctDelta) < TREND_FLAT_PCT;
  const dir: DayTrend['dir'] = flat ? 'flat' : absDelta > 0 ? 'up' : 'down';
  const spark = [...values.slice(-(TREND_SPARK_DAYS - 1)).map((v) => v ?? 0), todayValue];
  const yesterday = values[values.length - 1];
  let yDir: DayTrend['yDir'] = null;
  let yAbsDelta: number | null = null;
  let yPctDelta: number | null = null;
  if (yesterday !== null) {
    yAbsDelta = Math.round((todayValue - yesterday) * 10) / 10;
    yPctDelta = yesterday !== 0 ? (yAbsDelta / yesterday) * 100 : null;
    const yFlat = yPctDelta === null ? yAbsDelta === 0 : Math.abs(yPctDelta) < TREND_FLAT_PCT;
    yDir = yFlat ? 'flat' : yAbsDelta > 0 ? 'up' : 'down';
  }
  return {
    dir,
    absDelta,
    pctDelta,
    avg,
    avgDays: used.length,
    yesterday,
    yDir,
    yAbsDelta,
    yPctDelta,
    spark,
  };
}
