import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Moon,
  Sun,
  PillBottle,
  Pill,
  Edit,
  Bath,
  LampWallDown,
  Trophy,
  Ruler,
  Icon,
  Eye,
  EyeOff,
  Baby,
  Syringe,
  Camera,
  Apple,
  Droplets,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { diaper, bottleBaby } from '@lucide/lab';
import { Button } from '@/src/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/src/components/ui/dropdown-menu';
import { Calendar as CalendarComponent } from '@/src/components/ui/calendar';
import { FilterType } from '../types';
import { ActivityType } from '../types';
import TimelineV2Heatmap from './TimelineV2Heatmap';
import { useLocalization } from '@/src/context/localization';
import { useTimezone } from '@/app/context/timezone';
import { formatDateLong } from '@/src/utils/dateFormat';
import { formatAmountsByUnit } from '@/src/utils/foodLogUtils';
import { useUnit } from '@/src/hooks/useUnit';
import { fetchPhotosEnabled } from '@/src/utils/photoClientApi';
import { formatAmount } from '@/src/utils/formatAmount';
import { computeDailyStats, computeDayTrend, DayTrend, HistoryDayStats, MetricKey, TREND_HISTORY_DAYS } from '@/src/utils/dailyStats';
import { bucketByDate, toDateKey } from './useActivityCache';

import './TimelineV2DailyStats.css';

interface TimelineV2DailyStatsProps {
  activities: ActivityType[];
  /** Activities from the surrounding days too, so breast-feed sessions that span midnight group correctly. Falls back to activities. */
  windowActivities?: ActivityType[];
  heatmapActivities: ActivityType[];
  /** Activities of the days before the selected day — trend baseline for the tiles. */
  historyActivities?: ActivityType[];
  date: Date;
  isLoading?: boolean;
  activeFilter: FilterType;
  onDateChange: (days: number) => void;
  onDateSelection: (date: Date) => void;
  onFilterChange: (filter: FilterType) => void;
   isHeatmapVisible: boolean;
   onHeatmapToggle: () => void;
   breastMilkBalance?: string;
   defaultBottleUnit?: string;
   enableBreastMilkTracking?: boolean;
}

interface StatTile {
  filter: FilterType;
  label: string;
  value: string;
  icon: React.ReactNode;
  bgColor: string;
  iconColor: string;
  borderColor: string;
  bgActiveColor: string;
  /** Overrides the default filter-toggle behavior when the tile is tapped (e.g. navigating away). */
  onClick?: () => void;
  /** Numeric metric the trend (delta vs average + sparkline) is computed from. */
  metricKey?: MetricKey;
  metricKind?: 'count' | 'minutes';
  trend?: DayTrend | null;
}

const TimelineV2DailyStats: React.FC<TimelineV2DailyStatsProps> = ({
  activities,
  windowActivities,
  heatmapActivities,
  historyActivities = [],
  date,
  isLoading = false,
  activeFilter,
  onDateChange,
  onDateSelection,
  onFilterChange,
  isHeatmapVisible,
  onHeatmapToggle,
  breastMilkBalance,
  defaultBottleUnit,
  enableBreastMilkTracking = true
}) => {
  const { t } = useLocalization();
  const { unitSymbol } = useUnit();
  const { dateFormat } = useTimezone();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [photosEnabled, setPhotosEnabled] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    fetchPhotosEnabled().then(setPhotosEnabled);
  }, []);

  // Helper function to format minutes into hours and minutes
  const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}${t('min')}`;
  };

  const formatMetricValue = (kind: 'count' | 'minutes' | undefined, value: number): string => {
    const rounded = Math.round(value * 100) / 100;
    if (kind === 'minutes') return formatMinutes(rounded);
    return String(rounded);
  };

  const stats = useMemo(
    () => computeDailyStats(activities, windowActivities, date, { defaultBottleUnit, unitSymbol, t }),
    [activities, windowActivities, date, defaultBottleUnit, t]
  );

  const historyDayStats = useMemo<HistoryDayStats[]>(() => {
    const buckets = bucketByDate(historyActivities);
    const days: HistoryDayStats[] = [];
    for (let i = TREND_HISTORY_DAYS; i >= 1; i--) {
      const day = new Date(date);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const bucket = buckets.get(toDateKey(day)) ?? [];
      days.push({
        date: day,
        hasData: bucket.length > 0,
        metrics: computeDailyStats(bucket, historyActivities, day, { defaultBottleUnit, unitSymbol, t }),
      });
    }
    return days;
  }, [historyActivities, date, defaultBottleUnit, t]);

  // Calculate stats and create dynamic tiles
  const statTiles = useMemo(() => {
    const {
      awakeMinutes,
      totalSleepMinutes,
      diaperCount,
      wetCount,
      poopCount,
      medicineStats,
      supplementStats,
      noteCount,
      bathCount,
      pumpCount,
      pumpTotal,
      milestoneCount,
      measurementCount,
      playCount,
      totalPlayMinutes,
      vaccineCount,
      photoCount: photosTodayCount,
      feedStats,
      preferredUnit,
    } = stats;

    const tiles: StatTile[] = [];

    // Awake Time tile - always first
    if (awakeMinutes > 0) {
      tiles.push({
        filter: null,
        label: t('Awake Time'),
        value: formatMinutes(awakeMinutes),
        metricKey: 'awakeMinutes',
        metricKind: 'minutes',
        icon: <Sun className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-amber-600',
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Sleep tile
    if (totalSleepMinutes > 0) {
      tiles.push({
        filter: 'sleep',
        label: t('Total Sleep'),
        value: formatMinutes(totalSleepMinutes),
        metricKey: 'totalSleepMinutes',
        metricKind: 'minutes',
        icon: <Moon className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#9ca3af]', // gray-400 - matches timeline
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Feeds tile (bottle and breast)
    if (feedStats.milkFeedCount > 0) {
      // Format bottle feed amounts
      const formattedBottleAmounts = feedStats.bottleFeedTotal > 0
        ? `${Math.round(feedStats.bottleFeedTotal * 100) / 100} ${preferredUnit.toLowerCase()}`
        : '';

      // Format breast feed amounts separately for left and right
      const breastFeedParts: string[] = [];
      if (feedStats.leftBreastMinutes > 0 && feedStats.rightBreastMinutes > 0) {
        breastFeedParts.push(`${t('L:')} ${formatMinutes(feedStats.leftBreastMinutes)}`);
        breastFeedParts.push(`${t('R:')} ${formatMinutes(feedStats.rightBreastMinutes)}`);
      } else if (feedStats.leftBreastMinutes > 0) {
        breastFeedParts.push(`${t('Left:')} ${formatMinutes(feedStats.leftBreastMinutes)}`);
      } else if (feedStats.rightBreastMinutes > 0) {
        breastFeedParts.push(`${t('Right:')} ${formatMinutes(feedStats.rightBreastMinutes)}`);
      }
      const formattedBreastFeed = breastFeedParts.length > 0 ? breastFeedParts.join(', ') : '';

      // Build combined label
      const labelParts: string[] = [];
      if (formattedBottleAmounts) {
        labelParts.push(formattedBottleAmounts);
      }
      if (formattedBreastFeed) {
        labelParts.push(formattedBreastFeed);
      }

      const combinedLabel = labelParts.length > 0
        ? labelParts.join(' • ')
        : t('Feeds');

      tiles.push({
        filter: 'feed',
        label: combinedLabel,
        value: feedStats.milkFeedCount.toString(),
        metricKey: 'milkFeedCount',
        metricKind: 'count',
        icon: <Icon iconNode={bottleBaby} className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#7dd3fc]', // sky-300 - matches timeline
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Foods tile (issues #203/#207): food logs are the single source of truth
    // for solids eating, so this replaces the former separate Solids tile
    if (feedStats.solidsCount > 0) {
      const formattedSolidsAmounts = formatAmountsByUnit(feedStats.solidsAmounts);

      tiles.push({
        filter: 'food',
        label: formattedSolidsAmounts || t('Foods'),
        value: feedStats.solidsCount.toString(),
        metricKey: 'solidsCount',
        metricKind: 'count',
        icon: <Apple className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#BBD444]', // matches food timeline entries
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Diaper changes tile - combined "Wickeln" filter (all changes incl. DRY)
    if (diaperCount > 0) {
      tiles.push({
        filter: 'diaper',
        label: t('Diaper'),
        value: diaperCount.toString(),
        metricKey: 'diaperCount',
        metricKind: 'count',
        icon: <Icon iconNode={diaper} className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-gray-600',
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Wet diaper tile
    if (wetCount > 0) {
      tiles.push({
        filter: 'wet',
        label: t('Wet Diapers'),
        value: wetCount.toString(),
        metricKey: 'wetCount',
        metricKind: 'count',
        icon: <Icon iconNode={diaper} className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#0d9488]', // teal-600 (green) - matches timeline for wet
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Poop tile
    if (poopCount > 0) {
      tiles.push({
        filter: 'poop',
        label: t('Poops'),
        value: poopCount.toString(),
        metricKey: 'poopCount',
        metricKind: 'count',
        icon: <Icon iconNode={diaper} className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-amber-700', // amber-700 for poops
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Medicine tiles
    const medicineEntries = Object.entries(medicineStats).filter(([_, stats]) => stats.count > 0);
    if (medicineEntries.length > 0) {
      if (medicineEntries.length === 1) {
        const [medicineName, stats] = medicineEntries[0];
        tiles.push({
          filter: 'medicine',
          label: `${medicineName}: ${stats.count}x (${formatAmount(stats.total)} ${stats.unit})`,
          value: stats.count.toString(),
          metricKey: 'medicineTotalCount',
          metricKind: 'count',
          icon: <PillBottle className="h-full w-full" aria-hidden="true" />,
          bgColor: 'bg-gray-50',
          iconColor: 'text-[#43B755]', // green - matches timeline
          borderColor: 'border-gray-500',
          bgActiveColor: 'bg-gray-100'
        });
      } else {
        const totalCount = medicineEntries.reduce((sum, [_, stats]) => sum + stats.count, 0);
        const label = medicineEntries
          .map(([name, stats]) => `${name}: ${stats.count}x (${formatAmount(stats.total)} ${stats.unit})`)
          .join(', ');
        tiles.push({
          filter: 'medicine',
          label: label,
          value: totalCount.toString(),
          metricKey: 'medicineTotalCount',
          metricKind: 'count',
          icon: <PillBottle className="h-full w-full" aria-hidden="true" />,
          bgColor: 'bg-gray-50',
          iconColor: 'text-[#43B755]', // green - matches timeline
          borderColor: 'border-gray-500',
          bgActiveColor: 'bg-gray-100'
        });
      }
    }

    // Supplement tiles
    const supplementEntries = Object.entries(supplementStats).filter(([_, stats]) => stats.count > 0);
    if (supplementEntries.length > 0) {
      if (supplementEntries.length === 1) {
        const [supplementName, stats] = supplementEntries[0];
        tiles.push({
          filter: 'medicine',
          label: `${supplementName}: ${stats.count}x (${formatAmount(stats.total)} ${stats.unit})`,
          value: stats.count.toString(),
          metricKey: 'medicineTotalCount',
          metricKind: 'count',
          icon: <Pill className="h-full w-full" aria-hidden="true" />,
          bgColor: 'bg-gray-50',
          iconColor: 'text-[#43B755]', // green - matches timeline
          borderColor: 'border-gray-500',
          bgActiveColor: 'bg-gray-100'
        });
      } else {
        const totalCount = supplementEntries.reduce((sum, [_, stats]) => sum + stats.count, 0);
        const label = supplementEntries
          .map(([name, stats]) => `${name}: ${stats.count}x (${formatAmount(stats.total)} ${stats.unit})`)
          .join(', ');
        tiles.push({
          filter: 'medicine',
          label: label,
          value: totalCount.toString(),
          metricKey: 'medicineTotalCount',
          metricKind: 'count',
          icon: <Pill className="h-full w-full" aria-hidden="true" />,
          bgColor: 'bg-gray-50',
          iconColor: 'text-[#43B755]', // green - matches timeline
          borderColor: 'border-gray-500',
          bgActiveColor: 'bg-gray-100'
        });
      }
    }

    // Note tile
    if (noteCount > 0) {
      tiles.push({
        filter: 'note',
        label: t('Notes'),
        value: noteCount.toString(),
        metricKey: 'noteCount',
        metricKind: 'count',
        icon: <Edit className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#fef08a]', // yellow-200 - matches timeline
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Bath tile
    if (bathCount > 0) {
      tiles.push({
        filter: 'bath',
        label: t('Baths'),
        value: bathCount.toString(),
        metricKey: 'bathCount',
        metricKind: 'count',
        icon: <Bath className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#fb923c]', // orange-400 - matches timeline
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Pump tile
    if (pumpCount > 0) {
      const formattedPumpAmounts = pumpTotal > 0
        ? `${Math.round(pumpTotal * 100) / 100} ${preferredUnit.toLowerCase()}`
        : '';
      tiles.push({
        filter: 'pump',
        label: formattedPumpAmounts || t('Pump'),
        value: pumpCount.toString(),
        metricKey: 'pumpCount',
        metricKind: 'count',
        icon: <LampWallDown className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#c084fc]', // purple-400 - matches timeline
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Breast milk stored balance tile (only when tracking is enabled)
    if (breastMilkBalance && enableBreastMilkTracking !== false) {
      tiles.push({
        filter: null,
        label: t('Breast Milk Stored'),
        value: breastMilkBalance,
        icon: <LampWallDown className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#c084fc]', // purple-400 - matches pump
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Vaccine tile
    if (vaccineCount > 0) {
      tiles.push({
        filter: 'vaccine',
        label: t('Vaccines'),
        value: vaccineCount.toString(),
        metricKey: 'vaccineCount',
        metricKind: 'count',
        icon: <Syringe className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#EF4444]',
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Milestone tile
    if (milestoneCount > 0) {
      tiles.push({
        filter: 'milestone',
        label: t('Milestones'),
        value: milestoneCount.toString(),
        metricKey: 'milestoneCount',
        metricKind: 'count',
        icon: <Trophy className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#4875EC]', // blue - matches timeline
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Measurement tile
    if (measurementCount > 0) {
      tiles.push({
        filter: 'measurement',
        label: t('Measurements'),
        value: measurementCount.toString(),
        metricKey: 'measurementCount',
        metricKind: 'count',
        icon: <Ruler className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#EA6A5E]', // red - matches timeline
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Play/Activity tile
    if (playCount > 0) {
      const playLabel = totalPlayMinutes > 0 ? formatMinutes(totalPlayMinutes) : t('Play Time');
      tiles.push({
        filter: 'play',
        label: playLabel,
        value: playCount.toString(),
        metricKey: 'playCount',
        metricKind: 'count',
        icon: <Baby className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#F3C4A2]', // peach - matches play activity
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    // Photos Today tile - only shown when the deployment has photos enabled
    if (photosEnabled && photosTodayCount > 0) {
      tiles.push({
        filter: 'photo',
        label: t('Photos Today'),
        value: photosTodayCount.toString(),
        metricKey: 'photoCount',
        metricKind: 'count',
        icon: <Camera className="h-full w-full" aria-hidden="true" />,
        bgColor: 'bg-gray-50',
        iconColor: 'text-[#e11d48]', // rose - matches photo timeline entries
        borderColor: 'border-gray-500',
        bgActiveColor: 'bg-gray-100'
      });
    }

    return tiles.map((tile) => ({
      ...tile,
      trend: tile.metricKey ? computeDayTrend(stats, historyDayStats, tile.metricKey) : null,
    }));
  }, [stats, historyDayStats, t, photosEnabled]);

  const formatDateDisplay = (date: Date): string => {
    return formatDateLong(date, dateFormat);
  };

  // Same filter options as the full log dropdown, so /log-entry can filter
  // by all activity types — including the split diaper filters and the
  // combined diaper-change ("Wickeln") summary.
  const filterOptions = [
    { type: 'sleep', icon: <Moon className="h-4 w-4" aria-hidden="true" />, labelKey: 'Sleep' },
    { type: 'feed', icon: <Icon iconNode={bottleBaby} className="h-4 w-4" aria-hidden="true" />, labelKey: 'Feed' },
    { type: 'diaper', icon: <Icon iconNode={diaper} className="h-4 w-4" aria-hidden="true" />, labelKey: 'Diaper' },
    { type: 'wet', icon: <Droplets className="h-4 w-4" aria-hidden="true" />, labelKey: 'Wet Diapers' },
    { type: 'poop', icon: <Icon iconNode={diaper} className="h-4 w-4" aria-hidden="true" />, labelKey: 'Poops' },
    { type: 'bath', icon: <Bath className="h-4 w-4" aria-hidden="true" />, labelKey: 'Bath' },
    { type: 'note', icon: <Edit className="h-4 w-4" aria-hidden="true" />, labelKey: 'Note' },
    { type: 'pump', icon: <LampWallDown className="h-4 w-4" aria-hidden="true" />, labelKey: 'Pump' },
    ...(enableBreastMilkTracking ? [{ type: 'breast-milk-adjustment' as const, icon: <LampWallDown className="h-4 w-4" aria-hidden="true" />, labelKey: 'Milk Adjust' as const }] : []),
    { type: 'milestone', icon: <Trophy className="h-4 w-4" aria-hidden="true" />, labelKey: 'Milestone' },
    { type: 'measurement', icon: <Ruler className="h-4 w-4" aria-hidden="true" />, labelKey: 'Measurement' },
    { type: 'medicine', icon: <PillBottle className="h-4 w-4" aria-hidden="true" />, labelKey: 'Medicine' },
    { type: 'play', icon: <Baby className="h-4 w-4" aria-hidden="true" />, labelKey: 'Activity' },
    { type: 'vaccine', icon: <Syringe className="h-4 w-4" aria-hidden="true" />, labelKey: 'Vaccine' },
    { type: 'food', icon: <Apple className="h-4 w-4" aria-hidden="true" />, labelKey: 'Food' },
  ] as const;

  return (
    <section aria-label={t('Daily Summary')} className="overflow-hidden border-0 bg-white timeline-v2-daily-stats relative z-10">
      <div className="px-5 py-1 relative z-10">
        {/* Date Navigation Header */}
        <div className="flex items-center justify-center mb-2">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDateChange(-1)}
              className="h-8 w-8 text-gray-700 hover:bg-gray-100"
              aria-label={t('Previous day')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-8 px-3 text-sm font-medium text-gray-800 hover:bg-gray-100 min-w-[140px]"
                >
                  {formatDateDisplay(date)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-auto" align="start">
                <CalendarComponent
                  selected={date}
                  onSelect={(selectedDate) => {
                    if (selectedDate) {
                      selectedDate.setHours(0, 0, 0, 0);
                      onDateSelection(selectedDate);
                      setCalendarOpen(false);
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDateChange(1)}
              className="h-8 w-8 text-gray-700 hover:bg-gray-100"
              aria-label={t('Next day')}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Daily Summary Title with Collapse Toggle + Heatmap Toggle */}
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-3 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            aria-label={isCollapsed ? t('Expand daily summary') : t('Collapse daily summary')}
          >
            <span>{t('Daily Summary')}</span>
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          <div className="flex items-center gap-2">
            {/* Filters Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 h-8 px-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  {t('Filters')} <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {filterOptions.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.type}
                    checked={activeFilter === option.type}
                    onCheckedChange={() => onFilterChange(activeFilter === option.type ? null : option.type as FilterType)}
                    className="flex items-center gap-2"
                  >
                    <span className="flex items-center justify-center w-6">{option.icon}</span>
                    <span>{t(option.labelKey)}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile toggle */}
            <button
              type="button"
              className="text-xs inline-flex md:hidden items-center gap-1 text-teal-600 hover:text-teal-700"
              onClick={onHeatmapToggle}
            >
              {isHeatmapVisible ? (
                <>
                  <EyeOff className="h-3 w-3" aria-hidden="true" />
                  <span>{t('Hide heatmap')}</span>
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3" aria-hidden="true" />
                  <span>{t('Show heatmap')}</span>
                </>
              )}
            </button>

            {/* Desktop toggle */}
            <button
              type="button"
              className="ml-2 text-xs hidden md:inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 underline underline-offset-2"
              onClick={onHeatmapToggle}
            >
              {isHeatmapVisible ? (
                <>
                  <EyeOff className="h-3 w-3" aria-hidden="true" />
                  <span>{t('Hide heatmap')}</span>
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3" aria-hidden="true" />
                  <span>{t('Show heatmap')}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        {!isCollapsed && (
          <>
            {statTiles.length > 0 ? (
              <div className="flex flex-wrap gap-0.5">
                {statTiles.map((tile, index) => {
                  const trend = tile.trend ?? null;
                  const sparkMax = trend ? Math.max(...trend.spark, 1) : 1;
                  const avgLabel = t('{days}-day avg').replace('{days}', String(trend?.avgDays ?? TREND_HISTORY_DAYS));
                  return (
                  <button
                    key={tile.filter ? `${tile.filter}-${tile.label.toLowerCase().replace(/\s+/g, '-')}` : tile.label.toLowerCase().replace(/\s+/g, '-')}
                    onClick={() => {
                      if (tile.onClick) {
                        tile.onClick();
                        return;
                      }
                      // Only allow filtering if it's not the awake time tile
                      if (tile.filter !== null) {
                        onFilterChange(tile.filter === activeFilter ? null : tile.filter);
                      }
                    }}
                    className={`relative rounded-xl text-left transition-all duration-200 overflow-hidden ${
                      // Never show awake time tile as selected, only show selected state for filterable/clickable tiles
                      tile.filter !== null && activeFilter === tile.filter
                        ? 'bg-gray-100 cursor-pointer scale-105'
                        : tile.filter !== null || tile.onClick
                        ? 'bg-transparent cursor-pointer'
                        : 'bg-transparent cursor-default'
                    }`}
                  >
                    {/* Horizontal layout: icon left, text right */}
                    <div className="flex items-center gap-2.5 px-2 py-1">
                      {/* Icon */}
                      <div className={`flex-shrink-0 ${tile.iconColor}`}>
                        <div className="w-5 h-5">
                          {tile.icon}
                        </div>
                      </div>
                      
                      {/* Content */}
                      <div className="flex flex-col min-w-0">
                        <div className="text-base font-bold text-gray-800 leading-tight">{tile.value}</div>
                        <div className="text-xs text-gray-600 font-medium leading-tight">{tile.label}</div>
                        {trend && tile.metricKey && (
                          <div
                            className="flex items-center gap-0.5 text-[10px] leading-tight text-gray-400"
                            title={`${t('Today')}: ${formatMetricValue(tile.metricKind, stats[tile.metricKey])} · ${t('Yesterday')}: ${trend.yesterday !== null ? formatMetricValue(tile.metricKind, trend.yesterday) : '—'} · ${avgLabel}: ${formatMetricValue(tile.metricKind, trend.avg)}${trend.pctDelta !== null ? ` (${trend.pctDelta > 0 ? '+' : ''}${Math.round(trend.pctDelta)}%)` : ''}`}
                          >
                            {trend.dir === 'up' && <ArrowUp className="h-3 w-3" aria-hidden="true" />}
                            {trend.dir === 'down' && <ArrowDown className="h-3 w-3" aria-hidden="true" />}
                            <span>
                              {trend.dir === 'flat'
                                ? '≈'
                                : `${trend.dir === 'up' ? '+' : '-'}${formatMetricValue(tile.metricKind, Math.abs(trend.absDelta))}`}
                            </span>
                            <span className="text-gray-300">{avgLabel}: {formatMetricValue(tile.metricKind, trend.avg)}</span>
                          </div>
                        )}
                        {trend && (
                          <div className="flex items-end gap-[2px] h-3 mt-0.5" aria-hidden="true">
                            {trend.spark.map((value, i) => (
                              <span
                                key={i}
                                className={`w-[3px] rounded-[1px] ${i === trend.spark.length - 1 ? 'bg-gray-500' : 'bg-gray-300'}`}
                                style={{ height: `${2 + 10 * (value / sparkMax)}px` }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center py-4">
                {t('No activities recorded for this day')}
              </div>
            )}
          </>
        )}
      </div>

      {/* Mobile heatmap slide-out panel — portaled so header/tiles cannot cover it */}
      {portalReady && createPortal(
        <div className="fixed inset-0 z-[90] md:hidden pointer-events-none">
          <div
            className={`absolute inset-0 bg-black/40 touch-none transition-opacity duration-300 ${
              isHeatmapVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            onClick={onHeatmapToggle}
          />
          <div
            className={`
              fixed inset-y-0 w-24 bg-white shadow-xl flex flex-col
              transition-[right] duration-300
              timeline-v2-heatmap-panel
              ${isHeatmapVisible ? 'right-0 pointer-events-auto' : '-right-24 pointer-events-none'}
            `}
          >
            <div className="flex justify-end px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] mb-2 shrink-0">
              <button
                type="button"
                className="text-xs inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 underline underline-offset-2"
                onClick={onHeatmapToggle}
              >
                <EyeOff className="h-3 w-3" aria-hidden="true" />
                <span>{t('Hide')}</span>
              </button>
            </div>
            <div className="flex-1 min-h-0 px-1 py-2 pb-[env(safe-area-inset-bottom)]">
              <TimelineV2Heatmap
                activities={heatmapActivities}
                selectedDate={date}
                isVisible={isHeatmapVisible}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
};

export default TimelineV2DailyStats;
