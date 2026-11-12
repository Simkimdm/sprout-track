import { Settings } from '@prisma/client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import SleepForm from '@/src/components/forms/SleepForm';
import FeedForm from '@/src/components/forms/FeedForm';
import DiaperForm from '@/src/components/forms/DiaperForm';
import NoteForm from '@/src/components/forms/NoteForm';
import BathForm from '@/src/components/forms/BathForm';
import PumpForm from '@/src/components/forms/PumpForm';
import MilestoneForm from '@/src/components/forms/MilestoneForm';
import MeasurementForm from '@/src/components/forms/MeasurementForm';
import GiveMedicineForm from '@/src/components/forms/GiveMedicineForm';
import ActivityForm from '@/src/components/forms/ActivityForm';
import VaccineForm from '@/src/components/forms/VaccineForm';
import FoodForm from '@/src/components/forms/FoodForm';
import PhotoForm from '@/src/components/forms/PhotoForm';
import PhotoDetail from '@/src/components/PhotoDetail';
import { ActivityType, FilterType, TimelineCalendarEvent, TimelineProps } from '../types';
import { computeLatestStatus } from '@/src/utils/latestStatus';
import TimelineV2DailyStats from './TimelineV2DailyStats';
import TimelineV2ActivityList from './TimelineV2ActivityList';
import TimelineV2Heatmap from './TimelineV2Heatmap';
import TimelineActivityDetails from '../TimelineActivityDetails';
import { getActivityEndpoint, getActivityTime, matchesFilterType, startedOnOrAfter } from '../utils';
import { parseFeedTimerTypes } from '@/src/utils/feedTimerConfig';
import { buildFeedGapMap, buildFeedGapPoints, buildGapMap, buildGapDividerMap, FeedGapInfo, FeedGapRow } from '@/src/utils/feedSessionUtils';
import { FeedLogResponse, DiaperLogResponse, PumpLogResponse, BreastMilkAdjustmentResponse, PlayLogResponse, VaccineLogResponse, FoodLogResponse, PhotoResponse } from '@/app/api/types';
import { fetchPhotos } from '@/src/utils/photoClientApi';
import { useActivityCache } from './useActivityCache';
import { cacheDefaultBottleUnit, readCachedDefaultBottleUnit } from '@/src/utils/defaultBottleUnit';

const TimelineV2 = ({ babyId, refreshTrigger, initialDate, feedTimerTypes, feedTimerFrom, onLatestStatusReady, onActivityDeleted }: TimelineProps) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [defaultBottleUnit, setDefaultBottleUnit] = useState(() => readCachedDefaultBottleUnit());
  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoResponse | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  const [editModalType, setEditModalType] = useState<'sleep' | 'feed' | 'diaper' | 'medicine' | 'note' | 'bath' | 'pump' | 'breast-milk-adjustment' | 'milestone' | 'measurement' | 'play' | 'vaccine' | 'food' | 'photo' | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => initialDate ?? new Date());
  const [isHeatmapVisible, setIsHeatmapVisible] = useState<boolean>(false);

  // React to ?date= deep-link changes after mount (in-app navigation to the
  // same route doesn't remount; the parent memoizes initialDate on the param
  // value, so a new identity means the requested day actually changed)
  useEffect(() => {
    if (!initialDate) return;
    setSelectedDate(prev => (prev.toDateString() === initialDate.toDateString() ? prev : initialDate));
  }, [initialDate]);

  const [dateFilteredActivities, setDateFilteredActivities] = useState<ActivityType[]>([]);
  // Calendar events of the selected day, merged into the display list when the
  // family setting showCalendarEventsInTimeline is enabled (never part of stats/gaps)
  const [calendarEvents, setCalendarEvents] = useState<TimelineCalendarEvent[]>([]);
  // Recent feed entries before the selected day, used as gap anchor for the day's first feeding
  const [historyFeeds, setHistoryFeeds] = useState<ActivityType[]>([]);
  // Recent entries of the active filter's type before the selected day (deep history,
  // beyond the +/-1 day window) — anchor for the first-of-day gap divider of any filter
  const [filterHistory, setFilterHistory] = useState<ActivityType[]>([]);
  // Selected day ±1 so daily stats can group breast-feed sessions across midnight
  const [windowActivities, setWindowActivities] = useState<ActivityType[]>([]);
  const [heatmapActivities, setHeatmapActivities] = useState<ActivityType[]>([]);

  const [isLoadingActivities, setIsLoadingActivities] = useState<boolean>(false);
  const [isFetchAnimated, setIsFetchAnimated] = useState<boolean>(true);
  const [breastMilkBalance, setBreastMilkBalance] = useState<string | undefined>(undefined);
  const lastRefreshTimestamp = useRef<number>(Date.now());
  const wasIdle = useRef<boolean>(false);
  const prevRefreshTrigger = useRef<number>(refreshTrigger ?? 0);

  const activityCache = useActivityCache();

  const breastMilkTrackingEnabled = (settings as any)?.enableBreastMilkTracking ?? true;
  const showCalendarEvents = (settings as any)?.showCalendarEventsInTimeline ?? false;

  // Gap since the previous same-type entry for every feed/sleep row of the day
  // (feeds anchor across midnight via historyFeeds; sleep anchors at the previous sleep's end)
  const gapById = useMemo(() => {
    const isFeedRow = (a: ActivityType) =>
      'amount' in a && 'type' in a && !('foodId' in a) && (a as { type?: string }).type !== 'SOLIDS';
    const feeds = dateFilteredActivities.filter(isFeedRow) as unknown as FeedGapRow[];
    const history = historyFeeds.filter(isFeedRow) as unknown as FeedGapRow[];
    const feedGaps = buildFeedGapMap(feeds, feedTimerFrom === 'end' ? 'end' : 'start', history);
    const sleepPoints = dateFilteredActivities
      .filter(a => 'duration' in a && 'startTime' in a && !('activities' in a))
      .map(a => {
        const startTs = new Date((a as { startTime: string }).startTime).getTime();
        const durationSeconds = ((a as { duration?: number }).duration || 0) * 60; // SleepLog.duration is minutes
        const endTime = (a as { endTime?: string | null }).endTime;
        return { rowIds: [a.id], startTs, endTs: endTime ? new Date(endTime).getTime() : startTs + durationSeconds * 1000, durationSeconds };
      });
    const sleepGaps = buildGapMap(sleepPoints, 'end');
    return new Map<string, FeedGapInfo>([...feedGaps, ...sleepGaps]);
  }, [dateFilteredActivities, historyFeeds, feedTimerFrom]);

  // Activities of the previous day(s) from the fetched window, used as gap anchors so the
  // first entry of the viewed day can show its divider to the last entry of the day before
  const previousDayActivities = useMemo(() => {
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const startTs = startOfDay.getTime();
    return windowActivities.filter(a => new Date(getActivityTime(a)).getTime() < startTs);
  }, [windowActivities, selectedDate]);

  // Dividers between same-type entries always anchor at the previous entry's END,
  // so the logs' durations are included in the gap (pause between entries). Each gap is
  // keyed to the OLDER entry of the pair, so the divider renders between the two entries
  // (the list is newest first); a gap anchored at an unrendered history row stays on the
  // first entry of the day and shows above it.
  const dividerGapById = useMemo(() => {
    const isFeedRow = (a: ActivityType) =>
      'amount' in a && 'type' in a && !('foodId' in a) && (a as { type?: string }).type !== 'SOLIDS';
    const isSleepRow = (a: ActivityType) => 'duration' in a && 'startTime' in a && !('activities' in a);
    const feeds = dateFilteredActivities.filter(isFeedRow) as unknown as FeedGapRow[];
    const history = historyFeeds.filter(isFeedRow) as unknown as FeedGapRow[];
    const renderedIds = new Set(dateFilteredActivities.map(a => a.id));
    const feedDividers = buildGapDividerMap(buildFeedGapPoints(feeds, history), 'end', renderedIds);
    const toSleepPoint = (a: ActivityType) => {
      const startTs = new Date((a as { startTime: string }).startTime).getTime();
      const durationSeconds = ((a as { duration?: number }).duration || 0) * 60;
      const endTime = (a as { endTime?: string | null }).endTime;
      return { rowIds: [a.id], startTs, endTs: endTime ? new Date(endTime).getTime() : startTs + durationSeconds * 1000, durationSeconds };
    };
    const sleepPoints = [...previousDayActivities.filter(isSleepRow), ...dateFilteredActivities.filter(isSleepRow)].map(toSleepPoint);
    return new Map<string, FeedGapInfo>([...feedDividers, ...buildGapDividerMap(sleepPoints, 'end', renderedIds)]);
  }, [dateFilteredActivities, historyFeeds, previousDayActivities]);

  // Issue #225: feed categories that reset the "time since last feed" timer
  // (null = all feeds count)
  const feedTimerCategories = useMemo(() => parseFeedTimerTypes(feedTimerTypes), [feedTimerTypes]);

  // Extract latest status data from activities and notify parent
  const emitLatestStatus = useCallback((activities: ActivityType[]) => {
    if (!onLatestStatusReady) return;
    onLatestStatusReady(computeLatestStatus(activities, feedTimerCategories));
  }, [onLatestStatusReady, feedTimerCategories]);

  const fetchBreastMilkBalance = async (babyId: string) => {
    if (!breastMilkTrackingEnabled) {
      setBreastMilkBalance(undefined);
      return;
    }
    try {
      const authToken = localStorage.getItem('authToken');
      const unit = settings?.defaultBottleUnit || defaultBottleUnit;
      const response = await fetch(`/api/breast-milk-balance?babyId=${babyId}&unit=${unit}`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          const balance = data.data.balance;
          if (balance > 0) {
            setBreastMilkBalance(`${balance} ${data.data.unit.toLowerCase()}`);
          } else {
            setBreastMilkBalance(undefined);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching breast milk balance:', error);
    }
  };

  // Fetch the most recent feeds before the start of `date` (gap anchor for the day's first entry)
  const fetchHistoryFeeds = useCallback(async (date: Date) => {
    if (!babyId) return;
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const authToken = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/feed-log?babyId=${babyId}&startDate=${encodeURIComponent('1970-01-01T00:00:00.000Z')}&endDate=${encodeURIComponent(startOfDay.toISOString())}&limit=50`,
        {
          cache: 'no-store',
          headers: {
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Expires': '0',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) setHistoryFeeds(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching history feeds:', error);
    }
  }, [babyId]);

  // Fetch the latest entries of the active filter's type before the start of `date`.
  // One bounded call (types + explicit limit=50), so the first entry of the day can
  // anchor its gap divider at the previous same-type entry even if that is days ago.
  const filterTypeParam = (filter: FilterType): string | null => {
    if (!filter) return null;
    const map: Record<string, string> = {
      sleep: 'sleep', feed: 'feed', diaper: 'diaper', wet: 'diaper', poop: 'diaper',
      note: 'note', bath: 'bath', pump: 'pump', 'breast-milk-adjustment': 'breast-milk-adjustment',
      milestone: 'milestone', measurement: 'measurement', medicine: 'medicine',
      play: 'play', vaccine: 'vaccine', food: 'food', photo: 'photo',
    };
    return map[filter] ?? null;
  };

  const fetchFilterHistory = useCallback(async (date: Date, filter: FilterType) => {
    if (!babyId) {
      setFilterHistory([]);
      return;
    }
    // with an active filter: only that type; unfiltered: all types (anchor for the
    // first-of-day divider at the previous entry of any type)
    const typeParam = filterTypeParam(filter);
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const authToken = localStorage.getItem('authToken');
      const typesQuery = typeParam ? `&types=${typeParam}` : '';
      const response = await fetch(
        `/api/timeline?babyId=${babyId}&startDate=${encodeURIComponent('1970-01-01T00:00:00.000Z')}&endDate=${encodeURIComponent(startOfDay.toISOString())}${typesQuery}&limit=50&_t=${Date.now()}`,
        {
          cache: 'no-store',
          headers: {
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Expires': '0',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) setFilterHistory(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching filter history:', error);
    }
  }, [babyId]);

  useEffect(() => {
    fetchFilterHistory(selectedDate, activeFilter);
  }, [fetchFilterHistory, selectedDate, activeFilter]);

  // Fetch the calendar events starting on `date` (for the optional timeline merge)
  const fetchCalendarEvents = useCallback(async (date: Date) => {
    if (!babyId || !showCalendarEvents) {
      setCalendarEvents([]);
      return;
    }
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      const params = new URLSearchParams({
        babyId,
        startDate: startOfDay.toISOString(),
        endDate: endOfDay.toISOString(),
      });
      const authToken = localStorage.getItem('authToken');
      const response = await fetch(`/api/calendar-event?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCalendarEvents((data.data || []).map((event: any) => ({
            ...event,
            calendarEventId: event.id,
          })));
        }
      }
    } catch (error) {
      console.error('Error fetching calendar events for timeline:', error);
    }
  }, [babyId, showCalendarEvents]);

  // Fetch activities for date using cache
  const fetchActivitiesForDate = useCallback(async (date: Date, isAnimated: boolean) => {
    if (!babyId) return;

    setIsFetchAnimated(isAnimated);
    if (isAnimated) {
      setIsLoadingActivities(true);
    }

    try {
      const result = await activityCache.fetchWindow(babyId, date, 1);
      setDateFilteredActivities(result.activities);
      setWindowActivities(result.allActivities);
      fetchHistoryFeeds(date);
      fetchCalendarEvents(date);
      lastRefreshTimestamp.current = Date.now();

      // Only emit status when today is within the fetched window (prevents stale status on past dates)
      const todayKey = activityCache.toDateKey(new Date());
      const dayBefore = new Date(date); dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(date); dayAfter.setDate(dayAfter.getDate() + 1);
      const windowIncludesToday = todayKey === activityCache.toDateKey(date)
        || todayKey === activityCache.toDateKey(dayBefore)
        || todayKey === activityCache.toDateKey(dayAfter);

      if (windowIncludesToday) {
        emitLatestStatus(result.allActivities);
      }
    } catch (error) {
      console.error('Error fetching activities for date:', error);
      setDateFilteredActivities([]);
      setWindowActivities([]);
    } finally {
      if (isAnimated) {
        setIsLoadingActivities(false);
      }
    }
  }, [babyId, activityCache, emitLatestStatus, fetchCalendarEvents]);

  // Refresh just today's data (for polling — bypasses cache)
  const refreshCurrentDay = useCallback(async () => {
    if (!babyId) return;

    try {
      const activities = await activityCache.refreshDate(babyId, selectedDate);
      // The API returns baths from a wide lookback (for the status bubble);
      // the day-scoped display list must only show the selected day
      const selectedDayKey = activityCache.toDateKey(selectedDate);
      const dayActivities = activities.filter(a => {
        const timeStr = getActivityTime(a);
        return timeStr ? activityCache.toDateKey(new Date(timeStr)) === selectedDayKey : false;
      });
      setDateFilteredActivities(dayActivities);
      fetchCalendarEvents(selectedDate);
      // Rebuild the ±1 day window from cache around the refreshed day
      const prevDay = new Date(selectedDate); prevDay.setDate(prevDay.getDate() - 1);
      const nextDay = new Date(selectedDate); nextDay.setDate(nextDay.getDate() + 1);
      const windowActs = [
        ...(activityCache.getActivitiesForDate(activityCache.toDateKey(prevDay)) || []),
        ...activities,
        ...(activityCache.getActivitiesForDate(activityCache.toDateKey(nextDay)) || []),
      ];
      setWindowActivities(windowActs);
      lastRefreshTimestamp.current = Date.now();

      // Only emit status when refreshing today's data. Emit the full window so
      // a nursing session that straddles midnight groups with its earlier row
      const todayKey = activityCache.toDateKey(new Date());
      const selectedKey = activityCache.toDateKey(selectedDate);
      if (todayKey === selectedKey) {
        emitLatestStatus(windowActs);
      }
    } catch (error) {
      console.error('Error refreshing current day:', error);
    }
  }, [babyId, selectedDate, activityCache, emitLatestStatus, fetchCalendarEvents]);

  const fetchHeatmapData = useCallback(async () => {
    if (!babyId) return;
    try {
      const activities = await activityCache.fetchHeatmap(babyId, selectedDate);
      setHeatmapActivities(activities);
    } catch (error) {
      console.error('Error fetching heatmap data:', error);
    }
  }, [babyId, selectedDate, activityCache]);

  const handleFormSuccess = () => {
    setEditModalType(null);
    setSelectedActivity(null);

    if (babyId) {
      // Invalidate today's cache and re-fetch
      activityCache.invalidateDate(selectedDate);
      fetchActivitiesForDate(selectedDate, true);
      fetchBreastMilkBalance(babyId);

      // Also refresh heatmap if visible
      if (isHeatmapVisible) {
        fetchHeatmapData();
      }
    }

    if (onActivityDeleted) {
      onActivityDeleted();
    }
  };

  // Date navigation is handled entirely here; notifying the parent would only
  // bounce back as a refreshTrigger and duplicate (then abort) this fetch.
  const handleDateSelection = (newDate: Date) => {
    setSelectedDate(newDate);
    if (babyId) {
      fetchActivitiesForDate(newDate, true);
    }
  };

  const handleDateChange = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    handleDateSelection(newDate);
  };

  const handleFilterChange = (filter: FilterType) => {
    setActiveFilter(activeFilter === filter ? null : filter);
  };

  // Fetch settings and refresh them when a warm PWA becomes active again.
  const refreshSettings = useCallback(async () => {
    try {
      const authToken = localStorage.getItem('authToken');
      const response = await fetch('/api/settings', {
        cache: 'no-store',
        headers: {
          'Authorization': authToken ? `Bearer ${authToken}` : '',
        },
      });
      if (!response.ok) return;

      const data = await response.json();
      if (data.success) {
        setSettings(data.data);
        const unit = cacheDefaultBottleUnit(data.data?.defaultBottleUnit);
        if (unit) setDefaultBottleUnit(unit);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  }, []);

  useEffect(() => {
    refreshSettings();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshSettings();
    };
    window.addEventListener('focus', refreshSettings);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshSettings);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshSettings]);

  // Initial fetch when babyId changes
  useEffect(() => {
    if (babyId) {
      activityCache.invalidateAll();
      fetchActivitiesForDate(selectedDate, true);
    }
  }, [babyId]);

  // Fetch breast milk balance
  useEffect(() => {
    if (babyId) {
      fetchBreastMilkBalance(babyId);
    }
  }, [babyId, settings?.defaultBottleUnit, defaultBottleUnit]);

  // (Re)fetch calendar events when the setting or the day changes
  useEffect(() => {
    if (babyId) {
      fetchCalendarEvents(selectedDate);
    }
  }, [babyId, selectedDate, fetchCalendarEvents]);

  // Handle refreshTrigger from parent (form submissions in log-entry page)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger !== prevRefreshTrigger.current) {
      prevRefreshTrigger.current = refreshTrigger;
      if (babyId) {
        activityCache.invalidateDate(selectedDate);
        fetchActivitiesForDate(selectedDate, true);
        fetchBreastMilkBalance(babyId);
      }
    }
  }, [refreshTrigger]);

  // Lazy-load heatmap when toggled visible or date changes while visible
  useEffect(() => {
    if (isHeatmapVisible && babyId) {
      fetchHeatmapData();
    }
  }, [isHeatmapVisible, selectedDate, babyId]);

  // Single polling loop — replaces both parent and child polling
  useEffect(() => {
    if (!babyId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshCurrentDay();
      }
    };

    const poll = setInterval(() => {
      const idleThreshold = 5 * 60 * 1000; // 5 minutes
      const activeRefreshRate = 30 * 1000; // 30 seconds

      const idleTime = Date.now() - parseInt(localStorage.getItem('unlockTime') || `${Date.now()}`);
      const isCurrentlyIdle = idleTime >= idleThreshold;
      const timeSinceLastRefresh = Date.now() - lastRefreshTimestamp.current;

      if (wasIdle.current && !isCurrentlyIdle) {
        refreshCurrentDay();
      } else if (!isCurrentlyIdle && timeSinceLastRefresh > activeRefreshRate) {
        refreshCurrentDay();
      }

      wasIdle.current = isCurrentlyIdle;
    }, 10000);

    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(poll);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [babyId, refreshCurrentDay]);

  const sortedActivities = useMemo(() => {
    // An entry belongs to the day it STARTED on: overnight entries (e.g. a sleep that
    // began yesterday and ended today) are bucketed into both days by the cache, but the
    // display list of the selected day must not show entries that started before it.
    // Filter out breast-milk-adjustment activities when tracking is disabled
    const baseActivities = !breastMilkTrackingEnabled
      ? dateFilteredActivities.filter(a => startedOnOrAfter(a, selectedDate)).filter(activity => !('reason' in activity && 'amount' in activity && !('type' in activity) && !('leftAmount' in activity)))
      : dateFilteredActivities.filter(a => startedOnOrAfter(a, selectedDate));

    // Calendar events join the display list only when the setting is enabled
    const withCalendarEvents = showCalendarEvents
      ? [...baseActivities, ...calendarEvents]
      : baseActivities;

    const filtered = !activeFilter || activeFilter === null
      ? withCalendarEvents
      : withCalendarEvents.filter(activity => {
          // Calendar events only show unfiltered or under their own filter
          if ('calendarEventId' in activity) return activeFilter === 'calendar';
          return matchesFilterType(activity, activeFilter);
        });

    const sorted = [...filtered].sort((a, b) => {
      const timeA = new Date(getActivityTime(a));
      const timeB = new Date(getActivityTime(b));
      return timeB.getTime() - timeA.getTime();
    });

    return sorted;
  }, [dateFilteredActivities, activeFilter, breastMilkTrackingEnabled, showCalendarEvents, calendarEvents, selectedDate]);

  const handleDelete = async (activity: ActivityType) => {
    if (!confirm('Are you sure you want to delete this activity?')) return;

    const endpoint = getActivityEndpoint(activity);
    try {
      const authToken = localStorage.getItem('authToken');
      const response = await fetch(`/api/${endpoint}?id=${activity.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': authToken ? `Bearer ${authToken}` : '',
        },
      });

      if (response.ok) {
        setSelectedActivity(null);
        // Invalidate cache and refresh
        activityCache.invalidateDate(selectedDate);
        fetchActivitiesForDate(selectedDate, true);
        onActivityDeleted?.();
      }
    } catch (error) {
      console.error('Error deleting activity:', error);
    }
  };

  const handleEdit = (activity: ActivityType, type: 'sleep' | 'feed' | 'diaper' | 'medicine' | 'note' | 'bath' | 'pump' | 'breast-milk-adjustment' | 'milestone' | 'measurement' | 'play' | 'vaccine' | 'food' | 'photo') => {
    setSelectedActivity(activity);
    setEditModalType(type);
  };

  // Resolve a timeline thumbnail click to its full PhotoResponse for the detail drawer
  const handlePhotoClick = useCallback(async (photoId: string) => {
    if (!babyId) return;
    try {
      const result = await fetchPhotos({ babyId, limit: 200 });
      const photo = result.photos.find((p) => p.id === photoId);
      if (photo) setSelectedPhoto(photo);
    } catch (error) {
      console.error('Error fetching photo:', error);
    }
  }, [babyId]);

  return (
    // app header (80px + 1px border) + activity tile row (117px) + 1px rounding margin —
    // undershooting this budget gives the whole page a scrollbar
    <div className="flex flex-col h-[calc(100vh-199px)]">
      {/* Daily Stats with Integrated Date Navigation */}
      <TimelineV2DailyStats
        activities={dateFilteredActivities}
        windowActivities={windowActivities}
        heatmapActivities={heatmapActivities}
        date={selectedDate}
        isLoading={isLoadingActivities}
        activeFilter={activeFilter}
        onDateChange={handleDateChange}
        onDateSelection={handleDateSelection}
        onFilterChange={handleFilterChange}
        isHeatmapVisible={isHeatmapVisible}
        onHeatmapToggle={() => setIsHeatmapVisible((prev) => !prev)}
        breastMilkBalance={breastMilkTrackingEnabled ? breastMilkBalance : undefined}
        defaultBottleUnit={settings?.defaultBottleUnit || defaultBottleUnit}
        enableBreastMilkTracking={breastMilkTrackingEnabled}
      />

      {/* Activity List + Right-side Heatmap */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 min-w-0 overflow-hidden">
          <TimelineV2ActivityList
            activities={sortedActivities}
            settings={settings}
            isLoading={isLoadingActivities}
            isAnimated={isFetchAnimated}
            selectedDate={selectedDate}
            onActivitySelect={(activity) => {
              // Calendar events have no log-entry details/edit drawer
              if ('calendarEventId' in activity) return;
              setSelectedActivity(activity);
            }}
            onPhotoClick={handlePhotoClick}
            activeFilter={activeFilter}
            allActivities={dateFilteredActivities}
            historyActivities={previousDayActivities}
            filterHistory={filterHistory}
            feedTimerFrom={feedTimerFrom}
            gapById={gapById}
            dividerGapById={dividerGapById}
          />
        </div>

        {/* Right-side stacked heatmap - desktop/tablet */}
        {isHeatmapVisible && (
          <div className="hidden md:flex w-24 px-1 border-l border-gray-200 bg-white relative timeline-v2-heatmap-panel overflow-hidden">
            <TimelineV2Heatmap
              activities={heatmapActivities}
              selectedDate={selectedDate}
              isVisible={isHeatmapVisible}
            />
          </div>
        )}
      </div>

      {/* Activity Details */}
      <TimelineActivityDetails
        activity={selectedActivity}
        settings={settings}
        isOpen={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onPhotoClick={handlePhotoClick}
        gapById={gapById}
      />

      {/* Photo Detail - opened from a timeline thumbnail click */}
      <PhotoDetail
        isOpen={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        photo={selectedPhoto}
        onChanged={handleFormSuccess}
      />

      {/* Edit Forms */}
      {selectedActivity && editModalType && (
        <>
          <SleepForm
            isOpen={editModalType === 'sleep'}
            onClose={() => setEditModalType(null)}
            babyId={selectedActivity.babyId}
            initialTime={getActivityTime(selectedActivity)}
            activity={'duration' in selectedActivity && 'type' in selectedActivity && !('activities' in selectedActivity) ? selectedActivity : undefined}
            onSuccess={handleFormSuccess}
            isSleeping={false}
            onSleepToggle={() => {}}
          />
          <FeedForm
            isOpen={editModalType === 'feed'}
            onClose={() => setEditModalType(null)}
            babyId={selectedActivity.babyId}
            initialTime={getActivityTime(selectedActivity)}
            activity={'amount' in selectedActivity && !('foodId' in selectedActivity) ? selectedActivity : undefined}
            onSuccess={handleFormSuccess}
          />
          <DiaperForm
            isOpen={editModalType === 'diaper'}
            onClose={() => setEditModalType(null)}
            babyId={selectedActivity.babyId}
            initialTime={getActivityTime(selectedActivity)}
            activity={'condition' in selectedActivity ? selectedActivity : undefined}
            onSuccess={handleFormSuccess}
          />
          <NoteForm
            isOpen={editModalType === 'note'}
            onClose={() => setEditModalType(null)}
            babyId={selectedActivity.babyId}
            initialTime={getActivityTime(selectedActivity)}
            activity={'content' in selectedActivity ? selectedActivity : undefined}
            onSuccess={handleFormSuccess}
          />
          <BathForm
            isOpen={editModalType === 'bath'}
            onClose={() => setEditModalType(null)}
            babyId={selectedActivity.babyId}
            initialTime={getActivityTime(selectedActivity)}
            activity={'soapUsed' in selectedActivity ? selectedActivity : undefined}
            onSuccess={handleFormSuccess}
          />
          <PumpForm
            isOpen={editModalType === 'pump' || editModalType === 'breast-milk-adjustment'}
            onClose={() => {
              setEditModalType(null);
              setSelectedActivity(null);
            }}
            babyId={selectedActivity.babyId}
            initialTime={'startTime' in selectedActivity && selectedActivity.startTime ? String(selectedActivity.startTime) : getActivityTime(selectedActivity)}
            activity={
              ('leftAmount' in selectedActivity || 'rightAmount' in selectedActivity) ?
                (selectedActivity as unknown as PumpLogResponse) :
                undefined
            }
            adjustmentActivity={
              editModalType === 'breast-milk-adjustment' && 'reason' in selectedActivity
                ? (selectedActivity as unknown as BreastMilkAdjustmentResponse)
                : undefined
            }
            onSuccess={handleFormSuccess}
          />
          <MilestoneForm
            isOpen={editModalType === 'milestone'}
            onClose={() => {
              setEditModalType(null);
              setSelectedActivity(null);
            }}
            babyId={selectedActivity.babyId}
            initialTime={'date' in selectedActivity && selectedActivity.date ? String(selectedActivity.date) : getActivityTime(selectedActivity)}
            activity={'title' in selectedActivity && 'category' in selectedActivity ? selectedActivity : undefined}
            onSuccess={handleFormSuccess}
          />
          <MeasurementForm
            isOpen={editModalType === 'measurement'}
            onClose={() => {
              setEditModalType(null);
              setSelectedActivity(null);
            }}
            babyId={selectedActivity.babyId}
            initialTime={'date' in selectedActivity && selectedActivity.date ? String(selectedActivity.date) : getActivityTime(selectedActivity)}
            activity={'value' in selectedActivity && 'unit' in selectedActivity ? selectedActivity : undefined}
            onSuccess={handleFormSuccess}
          />
          <GiveMedicineForm
            isOpen={editModalType === 'medicine'}
            onClose={() => {
              setEditModalType(null);
              setSelectedActivity(null);
            }}
            babyId={selectedActivity.babyId}
            initialTime={'doseAmount' in selectedActivity && 'time' in selectedActivity ? String(selectedActivity.time) : getActivityTime(selectedActivity)}
            activity={'doseAmount' in selectedActivity && 'medicineId' in selectedActivity ? selectedActivity : undefined}
            onSuccess={handleFormSuccess}
            isSupplement={
              'medicine' in selectedActivity &&
              selectedActivity.medicine && typeof selectedActivity.medicine === 'object' &&
              'isSupplement' in selectedActivity.medicine
                ? !!(selectedActivity.medicine as any).isSupplement
                : false
            }
          />
          <ActivityForm
            isOpen={editModalType === 'play'}
            onClose={() => {
              setEditModalType(null);
              setSelectedActivity(null);
            }}
            babyId={selectedActivity.babyId}
            initialTime={'startTime' in selectedActivity && selectedActivity.startTime ? String(selectedActivity.startTime) : getActivityTime(selectedActivity)}
            activity={'activities' in selectedActivity && 'type' in selectedActivity ?
              (selectedActivity as unknown as PlayLogResponse) : undefined}
            onSuccess={handleFormSuccess}
          />
          <VaccineForm
            isOpen={editModalType === 'vaccine'}
            onClose={() => {
              setEditModalType(null);
              setSelectedActivity(null);
            }}
            babyId={selectedActivity.babyId}
            initialTime={'time' in selectedActivity && selectedActivity.time ? String(selectedActivity.time) : getActivityTime(selectedActivity)}
            activity={'vaccineName' in selectedActivity ? (selectedActivity as unknown as VaccineLogResponse) : undefined}
            onSuccess={handleFormSuccess}
          />
          <FoodForm
            isOpen={editModalType === 'food'}
            onClose={() => {
              setEditModalType(null);
              setSelectedActivity(null);
            }}
            babyId={selectedActivity.babyId}
            initialTime={'time' in selectedActivity && selectedActivity.time ? String(selectedActivity.time) : getActivityTime(selectedActivity)}
            activity={'foodId' in selectedActivity ? (selectedActivity as unknown as FoodLogResponse) : undefined}
            onSuccess={handleFormSuccess}
          />
          <PhotoForm
            isOpen={editModalType === 'photo'}
            onClose={() => {
              setEditModalType(null);
              setSelectedActivity(null);
            }}
            babyId={selectedActivity.babyId}
            initialTime={getActivityTime(selectedActivity)}
            activity={'photoLogId' in selectedActivity ? { photoLogId: (selectedActivity as any).photoLogId } : undefined}
            onSuccess={handleFormSuccess}
          />
        </>
      )}
    </div>
  );
};

export default TimelineV2;
