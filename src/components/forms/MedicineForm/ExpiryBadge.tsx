'use client';

import React from 'react';
import { CalendarClock } from 'lucide-react';
import { Badge } from '@/src/components/ui/badge';
import { useLocalization } from '@/src/context/localization';
import { useTimezone } from '@/app/context/timezone';
import { formatDateShort } from '@/src/utils/dateFormat';
import { getMedicineExpiryInfo } from '@/src/utils/medicineExpiry';

interface ExpiryBadgeProps {
  /** Expiry date as ISO string (API) or Date; null/undefined renders nothing */
  expiryDate: string | Date | null | undefined;
}

/**
 * ExpiryBadge Component
 *
 * Shows the expiry/overdue timer state of a medicine or supplement package:
 * - expired: red "overdue since X days"
 * - expiring soon (within warning window): amber countdown "expires in X days"
 * - ok: neutral badge with the formatted expiry date
 */
const ExpiryBadge: React.FC<ExpiryBadgeProps> = ({ expiryDate }) => {
  const { t } = useLocalization();
  const { dateFormat } = useTimezone();

  const info = getMedicineExpiryInfo(expiryDate);
  if (info.status === 'none' || !expiryDate) return null;

  const days = info.daysRemaining ?? 0;
  const dayLabel = Math.abs(days) === 1 ? t('1 Day') : `${Math.abs(days)} ${t('Days')}`;

  if (info.status === 'expired') {
    return (
      <Badge variant="error" className="gap-1">
        <CalendarClock className="h-3 w-3" aria-hidden="true" />
        {t('Overdue by')} {dayLabel}
      </Badge>
    );
  }

  if (info.status === 'expiring-soon') {
    return (
      <Badge variant="warning" className="gap-1">
        <CalendarClock className="h-3 w-3" aria-hidden="true" />
        {days === 0 ? t('Expires today') : `${t('Expires in')} ${dayLabel}`}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1">
      <CalendarClock className="h-3 w-3" aria-hidden="true" />
      {t('Expires on')} {formatDateShort(new Date(expiryDate), dateFormat)}
    </Badge>
  );
};

export default ExpiryBadge;
