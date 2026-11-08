import { ReactElement } from 'react';
import { Icon as LucideIcon } from 'lucide-react';

export type StatusType = 'sleeping' | 'awake' | 'feed' | 'feedActive' | 'diaper' | 'pump' | 'bath' | 'medicine';

export interface StatusBubbleProps {
  /** Current status of the baby */
  status: StatusType;
  /** Duration in minutes for the current status */
  durationInMinutes: number;
  /** Warning threshold time in "hh:mm" format */
  warningTime?: string;
  /** Additional CSS classes */
  className?: string;
  /** Type of activity this status bubble is for (used to filter relevant activities) */
  activityType?: 'sleep' | 'feed' | 'diaper' | 'pump' | 'bath' | 'medicine';
  /** Optional name shown in front of the duration (e.g. the next-due medicine) */
  label?: string;
}

export interface StatusStyle {
  bgColor: string;
  icon: ReactElement<typeof LucideIcon> | null;
}
