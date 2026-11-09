'use client';

import { useId, useEffect, useState } from 'react';
import { Unit } from '@prisma/client';
import { Settings } from '@/app/api/types';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select';
import { useLocalization } from '@/src/context/localization';
import { useTimezone } from '@/app/context/timezone';
import { DateFormatSetting, TimeFormatSetting } from '@/src/utils/dateFormat';
import {
  isValidTimeString,
  parseNightSleepWindow,
  serializeNightSleepWindow,
} from '@/src/utils/nightSleepWindow';
import NotificationSettings from './NotificationSettings';
import { Baby } from '@prisma/client';
import { useUnit } from '@/src/hooks/useUnit';

interface UserSettingsTabProps {
  settings: Settings | null;
  units: Unit[];
  loading: boolean;
  babies: Baby[];
  deploymentConfig: { deploymentMode: string; enableAccounts: boolean; allowAccountRegistration: boolean; notificationsEnabled?: boolean } | null;
  onSettingsChange: (updates: Partial<Settings>) => Promise<void>;
}

export default function UserSettingsTab({
  settings,
  units,
  loading,
  babies,
  deploymentConfig,
  onSettingsChange,
}: UserSettingsTabProps) {
  const { t } = useLocalization();
  const { unitName, unitSymbol } = useUnit();
  const { setDateTimeFormats } = useTimezone();
  const idPrefix = useId();
  const dateFormatId = `${idPrefix}-date-format`;
  const timeFormatId = `${idPrefix}-time-format`;
  const nightWindowEnabledId = `${idPrefix}-night-window-enabled`;
  const nightWindowStartId = `${idPrefix}-night-window-start`;
  const nightWindowEndId = `${idPrefix}-night-window-end`;

  const [nightWindowEnabled, setNightWindowEnabled] = useState(false);
  const [nightWindowStart, setNightWindowStart] = useState('22:00');
  const [nightWindowEnd, setNightWindowEnd] = useState('07:00');

  useEffect(() => {
    const parsed = parseNightSleepWindow(settings?.nightSleepWindow ?? null);
    setNightWindowEnabled(!!parsed);
    if (parsed) {
      setNightWindowStart(parsed.start);
      setNightWindowEnd(parsed.end);
    }
  }, [settings?.nightSleepWindow]);

  const persistNightWindow = (enabled: boolean, start: string, end: string) => {
    if (!enabled) {
      onSettingsChange({ nightSleepWindow: null });
      return;
    }
    if (!isValidTimeString(start) || !isValidTimeString(end) || start === end) return;
    onSettingsChange({ nightSleepWindow: serializeNightSleepWindow({ start, end }) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="form-label mb-4">{t('Default Units')}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bottle Feeding Unit */}
            <div>
              <Label className="form-label" htmlFor={`${idPrefix}-bottle-unit`}>{t('Bottle Feeding')}</Label>
              <Select
                value={settings?.defaultBottleUnit || 'OZ'}
                onValueChange={(value) => onSettingsChange({ defaultBottleUnit: value })}
                disabled={loading}
              >
                <SelectTrigger id={`${idPrefix}-bottle-unit`}>
                  <SelectValue placeholder={t("Select unit")} />
                </SelectTrigger>
                <SelectContent>
                  {units
                    .filter(unit => ['OZ', 'ML'].includes(unit.unitAbbr))
                    .map((unit) => (
                      <SelectItem key={unit.unitAbbr} value={unit.unitAbbr}>
                        {unitName(unit.unitName)} ({unitSymbol(unit.unitAbbr)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Solid Feeding Unit */}
            <div>
              <Label className="form-label" htmlFor={`${idPrefix}-solids-unit`}>{t('Solid Feeding')}</Label>
              <Select
                value={settings?.defaultSolidsUnit || 'TBSP'}
                onValueChange={(value) => onSettingsChange({ defaultSolidsUnit: value })}
                disabled={loading}
              >
                <SelectTrigger id={`${idPrefix}-solids-unit`}>
                  <SelectValue placeholder={t("Select unit")} />
                </SelectTrigger>
                <SelectContent>
                  {units
                    .filter(unit => ['TBSP', 'G'].includes(unit.unitAbbr))
                    .map((unit) => (
                      <SelectItem key={unit.unitAbbr} value={unit.unitAbbr}>
                        {unitName(unit.unitName)} ({unitSymbol(unit.unitAbbr)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Height Unit */}
            <div>
              <Label className="form-label" htmlFor={`${idPrefix}-height-unit`}>{t('Height')}</Label>
              <Select
                value={settings?.defaultHeightUnit || 'IN'}
                onValueChange={(value) => onSettingsChange({ defaultHeightUnit: value })}
                disabled={loading}
              >
                <SelectTrigger id={`${idPrefix}-height-unit`}>
                  <SelectValue placeholder={t("Select unit")} />
                </SelectTrigger>
                <SelectContent>
                  {units
                    .filter(unit => ['IN', 'CM'].includes(unit.unitAbbr))
                    .map((unit) => (
                      <SelectItem key={unit.unitAbbr} value={unit.unitAbbr}>
                        {unitName(unit.unitName)} ({unitSymbol(unit.unitAbbr)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Weight Unit */}
            <div>
              <Label className="form-label" htmlFor={`${idPrefix}-weight-unit`}>{t('Weight')}</Label>
              <Select
                value={settings?.defaultWeightUnit || 'LB'}
                onValueChange={(value) => onSettingsChange({ defaultWeightUnit: value })}
                disabled={loading}
              >
                <SelectTrigger id={`${idPrefix}-weight-unit`}>
                  <SelectValue placeholder={t("Select unit")} />
                </SelectTrigger>
                <SelectContent>
                  {units
                    .filter(unit => ['LB', 'KG', 'G'].includes(unit.unitAbbr))
                    .map((unit) => (
                      <SelectItem key={unit.unitAbbr} value={unit.unitAbbr}>
                        {unitName(unit.unitName)} ({unitSymbol(unit.unitAbbr)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Temperature Unit */}
            <div>
              <Label className="form-label" htmlFor={`${idPrefix}-temp-unit`}>{t('Temperature')}</Label>
              <Select
                value={settings?.defaultTempUnit || 'F'}
                onValueChange={(value) => onSettingsChange({ defaultTempUnit: value })}
                disabled={loading}
              >
                <SelectTrigger id={`${idPrefix}-temp-unit`}>
                  <SelectValue placeholder={t("Select unit")} />
                </SelectTrigger>
                <SelectContent>
                  {units
                    .filter(unit => ['F', 'C'].includes(unit.unitAbbr))
                    .map((unit) => (
                      <SelectItem key={unit.unitAbbr} value={unit.unitAbbr}>
                        {unitName(unit.unitName)} ({unitSymbol(unit.unitAbbr)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Date & Time Format */}
      <div>
        <h3 className="form-label mb-4">{t('Date & Time Format')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="form-label" htmlFor={dateFormatId}>{t('Date Format')}</Label>
            <Select
              value={(settings as any)?.dateFormat || 'MM/DD/YYYY'}
              onValueChange={(value) => {
                onSettingsChange({ dateFormat: value } as any);
                setDateTimeFormats(value as DateFormatSetting, ((settings as any)?.timeFormat || '12h') as TimeFormatSetting);
              }}
              disabled={loading}
            >
              <SelectTrigger id={dateFormatId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (04/06/2026)</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (06/04/2026)</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2026-04-06)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="form-label" htmlFor={timeFormatId}>{t('Time Format')}</Label>
            <Select
              value={(settings as any)?.timeFormat || '12h'}
              onValueChange={(value) => {
                onSettingsChange({ timeFormat: value } as any);
                setDateTimeFormats(((settings as any)?.dateFormat || 'MM/DD/YYYY') as DateFormatSetting, value as TimeFormatSetting);
              }}
              disabled={loading}
            >
              <SelectTrigger id={timeFormatId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12h">{t('12-hour')} (1:30 PM)</SelectItem>
                <SelectItem value="24h">{t('24-hour')} (13:30)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Growth Chart Standard */}
      <div>
        <h3 className="form-label mb-4">{t('Growth Chart Standard')}</h3>
        <p className="text-sm text-gray-500 mb-4">{t('Choose which growth reference to use for percentile calculations.')}</p>
        <div className="max-w-xs">
          <Label className="form-label" htmlFor={`${idPrefix}-growth-standard`}>{t('Standard')}</Label>
          <Select
            value={settings?.growthChartStandard || 'CDC'}
            onValueChange={(value: 'CDC' | 'WHO') => onSettingsChange({ growthChartStandard: value })}
            disabled={loading}
          >
            <SelectTrigger id={`${idPrefix}-growth-standard`}>
              <SelectValue placeholder={t("Select standard")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CDC">
                CDC
              </SelectItem>
              <SelectItem value="WHO">
                WHO — {t('0–24 months')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Week Start Day */}
      <div>
        <h3 className="form-label mb-4">{t('Week Start Day')}</h3>
        <p className="text-sm text-gray-500 mb-4">{t('Choose which day the week starts on for calendar views and reports.')}</p>
        <div className="max-w-xs">
          <Label className="form-label" htmlFor={`${idPrefix}-week-starts-on`}>{t('Start Day')}</Label>
          <Select
            value={settings?.weekStartsOn || 'Sunday'}
            onValueChange={(value: 'Sunday' | 'Monday') => onSettingsChange({ weekStartsOn: value })}
            disabled={loading}
          >
            <SelectTrigger id={`${idPrefix}-week-starts-on`}>
              <SelectValue placeholder={t("Select day")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Sunday">
                {t('Sunday')}
              </SelectItem>
              <SelectItem value="Monday">
                {t('Monday')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Night Sleep Window */}
      <div>
        <h3 className="form-label mb-4">{t('Night Sleep Window')}</h3>
        <p className="text-sm text-gray-500 mb-4">{t('Naps starting within this daily time window are automatically tracked as night sleep.')}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="form-label" htmlFor={nightWindowEnabledId}>{t('Night Sleep Window')}</Label>
            <Select
              value={nightWindowEnabled ? 'enabled' : 'disabled'}
              onValueChange={(value) => {
                const enabled = value === 'enabled';
                setNightWindowEnabled(enabled);
                persistNightWindow(enabled, nightWindowStart, nightWindowEnd);
              }}
              disabled={loading}
            >
              <SelectTrigger id={nightWindowEnabledId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">{t('Disabled')}</SelectItem>
                <SelectItem value="enabled">{t('Enabled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {nightWindowEnabled && (
            <>
              <div>
                <Label className="form-label" htmlFor={nightWindowStartId}>{t('Start Time')}</Label>
                <Input
                  id={nightWindowStartId}
                  type="time"
                  value={nightWindowStart}
                  onChange={(e) => {
                    setNightWindowStart(e.target.value);
                    persistNightWindow(true, e.target.value, nightWindowEnd);
                  }}
                  disabled={loading}
                />
              </div>
              <div>
                <Label className="form-label" htmlFor={nightWindowEndId}>{t('End Time')}</Label>
                <Input
                  id={nightWindowEndId}
                  type="time"
                  value={nightWindowEnd}
                  onChange={(e) => {
                    setNightWindowEnd(e.target.value);
                    persistNightWindow(true, nightWindowStart, e.target.value);
                  }}
                  disabled={loading}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Notification Settings - Only show if enabled */}
      {deploymentConfig?.notificationsEnabled && (
        <NotificationSettings
          babies={babies}
          loading={loading}
        />
      )}
    </div>
  );
}
