import { Settings } from '@prisma/client';
import { ActivityType as ImportedActivityType } from '@/src/components/ui/activity-tile/activity-tile.types';
import { SleepLogResponse, PhotoLogResponse, TimelinePhotoInfo } from '@/app/api/types';

// Helper to add the optional batched photo-thumbnail info to attachable activity types
type WithPhotos<T> = T & { photos?: TimelinePhotoInfo[] };

// Define the extended ActivityType that includes caretaker information
export type TimelineActivityType = (
  WithPhotos<ImportedActivityType>
  | (Omit<PhotoLogResponse, 'photos'> & { photoLogId: string; photos?: TimelinePhotoInfo[] })
) & {
  caretakerId?: string | null;
  caretakerName?: string;
  caretakerBadgeColor?: string | null;
};

// Use TimelineActivityType for internal component logic
export type ActivityType = TimelineActivityType;

export type FilterType = 'sleep' | 'feed' | 'diaper' | 'wet' | 'poop' | 'medicine' | 'note' | 'bath' | 'pump' | 'breast-milk-adjustment' | 'milestone' | 'measurement' | 'play' | 'vaccine' | 'food' | 'photo' | null;

export interface LatestStatusData {
  lastFeedTime?: Date;
  lastFeedEndTime?: Date;
  /** Total feeding duration (minutes) of the last feed session (sum of all its rows). */
  lastFeedDurationMinutes?: number;
  lastDiaperTime?: Date;
  lastBathTime?: Date;
  lastPumpTime?: Date;
  lastSleepEndTime?: Date;
  ongoingSleep?: SleepLogResponse;
  lastEndedSleep?: SleepLogResponse & { endTime: string };
  /** The medicine/supplement whose per-medicine dose timer expires next (smallest lastDose + warningTime) */
  nextMedicineDue?: {
    medicineId: string;
    medicineName: string | null;
    lastDoseTime: Date;
    warningTime: string;
    dueAt: Date;
  };
}

// Legacy props for the old Timeline component (not actively used)
export interface LegacyTimelineProps {
  activities: ImportedActivityType[];
  onActivityDeleted?: (dateFilter?: Date) => void;
}

export interface TimelineProps {
  babyId: string;
  refreshTrigger?: number;
  /** Initial selected day (e.g. from a ?date=YYYY-MM-DD deep link); defaults to today. */
  initialDate?: Date;
  /** JSON config of feed categories that reset the feed timer (issue #225); null/omitted = all feeds count. */
  feedTimerTypes?: string | null;
  /** Whether the feed timer (and the filtered timeline's +/- x:yy gap) counts from the feed start or end. */
  feedTimerFrom?: string | null;
  onLatestStatusReady?: (data: LatestStatusData) => void;
  onActivityDeleted?: (dateFilter?: Date) => void;
}

export interface TimelineFilterProps {
  selectedDate: Date;
  activeFilter: FilterType;
  onDateChange: (days: number) => void;
  onDateSelection: (date: Date) => void;
  onFilterChange: (filter: FilterType) => void;
  enableBreastMilkTracking?: boolean;
}

export interface TimelineActivityListProps {
  activities: ActivityType[];
  settings: Settings | null;
  isLoading: boolean;
  isAnimated?: boolean;
  selectedDate?: Date;
  itemsPerPage?: number;
  currentPage?: number;
  totalPages?: number;
  onActivitySelect: (activity: ActivityType) => void;
  onPageChange?: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  onSwipeLeft?: () => void; // Handler for swiping left (next day)
  onSwipeRight?: () => void; // Handler for swiping right (previous day)
  onPhotoClick?: (photoId: string) => void; // Handler for tapping a timeline photo thumbnail
  /** Active type filter — when set, linked L+R breast-feed rows render grouped and feeds show the +/- x:yy gap */
  activeFilter?: FilterType;
  /** Gap anchor for the +/- x:yy suffix: 'start' (previous feeding start) or 'end' (previous feeding end) */
  feedTimerFrom?: string | null;
  /** Unfiltered activities of the selected day, used to compute the gap to the previous feeding */
  allActivities?: ActivityType[];
  /** Feed entries before the selected day, used as gap anchor for the day's first feeding */
  historyActivities?: ActivityType[];
  /** Per-entry gap since the previous same-type entry (feeds + sleep), keyed by activity id */
  gapById?: Map<string, import('@/src/utils/feedSessionUtils').FeedGapInfo>;
  /** End-anchored variant (pause since previous entry ENDED, durations included) for the between-entry dividers */
  dividerGapById?: Map<string, import('@/src/utils/feedSessionUtils').FeedGapInfo>;
}

export interface TimelineActivityDetailsProps {
  activity: ActivityType | null;
  settings: Settings | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (activity: ActivityType) => void;
  onEdit: (activity: ActivityType, type: 'sleep' | 'feed' | 'diaper' | 'medicine' | 'note' | 'bath' | 'pump' | 'breast-milk-adjustment' | 'milestone' | 'measurement' | 'play' | 'vaccine' | 'food' | 'photo') => void;
  onPhotoClick?: (photoId: string) => void; // Handler for tapping an attached photo thumbnail
  /** Per-entry gap since the previous same-type entry, shown as an extra details row */
  gapById?: Map<string, import('@/src/utils/feedSessionUtils').FeedGapInfo>;
}

export interface ActivityDetail {
  label: string;
  value: string;
}

export interface ActivityDetails {
  title: string;
  details: ActivityDetail[];
}

export interface ActivityDescription {
  type: string;
  details: string;
}

export interface ActivityStyle {
  bg: string;
  textColor: string;
}
