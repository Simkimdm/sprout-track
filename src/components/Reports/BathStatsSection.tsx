'use client';

import React, { useState } from 'react';
import { Bath } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Card, CardContent } from '@/src/components/ui/card';
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/src/components/ui/accordion';
import { styles } from './reports.styles';
import { BathStats, ActivityType, DateRange } from './reports.types';
import BathChartModal, { BathChartMetric } from './BathChartModal';
import { useLocalization } from '@/src/context/localization';
import { WeekStartSetting } from '@/src/utils/dateFormat';
import { Settings } from '@/app/api/types';

interface BathStatsSectionProps {
  stats: BathStats;
  activities: ActivityType[];
  dateRange: DateRange;
}

/**
 * BathStatsSection Component
 *
 * Displays bath statistics including total baths and frequency.
 */
const BathStatsSection: React.FC<BathStatsSectionProps> = ({ stats, activities, dateRange }) => {
  const { t } = useLocalization();
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [chartMetric, setChartMetric] = useState<BathChartMetric | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Fetch settings for week start preference
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const authToken = localStorage.getItem('authToken');
        const headers: HeadersInit = authToken ? {
          'Authorization': `Bearer ${authToken}`
        } : {};

        const response = await fetch('/api/settings', { headers });
        if (response.ok) {
          const data = await response.json();
          setSettings(data.data);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };

    fetchSettings();
  }, []);

  return (
    <>
      <AccordionItem value="baths">
        <AccordionTrigger className={cn(styles.accordionTrigger, "reports-accordion-trigger")}>
          <Bath aria-hidden="true" className={cn(styles.accordionTriggerIcon, "reports-accordion-trigger-icon reports-icon-bath")} />
          <span>{t('Bath Statistics')}</span>
        </AccordionTrigger>
        <AccordionContent className={styles.accordionContent}>
          <div className={styles.statsGrid}>
            <Card
              className={cn(styles.statCard, "reports-stat-card cursor-pointer")}
              onClick={() => {
                setChartMetric('total');
                setChartModalOpen(true);
              }}
            >
              <CardContent className="p-4">
                <div className={cn(styles.statCardValue, "reports-stat-card-value")}>
                  {stats.totalBaths}
                </div>
                <div className={cn(styles.statCardLabel, "reports-stat-card-label")}>{t('Total Baths')}</div>
              </CardContent>
            </Card>

            <Card
              className={cn(styles.statCard, "reports-stat-card cursor-pointer")}
              onClick={() => {
                setChartMetric('avgPerWeek');
                setChartModalOpen(true);
              }}
            >
              <CardContent className="p-4">
                <div className={cn(styles.statCardValue, "reports-stat-card-value")}>
                  {stats.bathsPerWeek.toFixed(1)}
                </div>
                <div className={cn(styles.statCardLabel, "reports-stat-card-label")}>{t('Avg Baths per Week')}</div>
              </CardContent>
            </Card>

            <Card
              className={cn(styles.statCard, "reports-stat-card cursor-pointer")}
              onClick={() => {
                setChartMetric('soapShampoo');
                setChartModalOpen(true);
              }}
            >
              <CardContent className="p-4">
                <div className={cn(styles.statCardValue, "reports-stat-card-value")}>
                  {stats.soapShampooBathsPerWeek.toFixed(1)}
                </div>
                <div className={cn(styles.statCardLabel, "reports-stat-card-label")}>{t('Avg Soap/Shampoo Baths per Week')}</div>
              </CardContent>
            </Card>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Bath chart modal */}
      <BathChartModal
        open={chartModalOpen}
        onOpenChange={(open) => {
          setChartModalOpen(open);
          if (!open) {
            setChartMetric(null);
          }
        }}
        metric={chartMetric}
        activities={activities}
        dateRange={dateRange}
        weekStartsOn={settings?.weekStartsOn as WeekStartSetting}
      />
    </>
  );
};

export default BathStatsSection;

