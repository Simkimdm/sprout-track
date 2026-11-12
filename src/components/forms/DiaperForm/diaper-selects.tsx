'use client';

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select';
import { useLocalization } from '@/src/context/localization';
import { DIAPER_COLORS, DIAPER_COLOR_HEX, DIAPER_SMELLS, DiaperColor } from '@/src/utils/diaperColors';

const COLOR_LABELS: Record<DiaperColor, string> = {
  BLACK: 'Black',
  GREEN: 'Green',
  GREENISH_YELLOW: 'Greenish Yellow',
  LIGHT_GREEN: 'Light Green',
  YELLOW: 'Yellow',
  ORANGE: 'Orange',
  GREENISH_BROWN: 'Greenish Brown',
  BROWN: 'Brown',
  RED: 'Red',
  WHITE: 'White',
  GREY: 'Gray',
  OTHER: 'Other',
};

const SMELL_LABELS: Record<string, string> = {
  ODORLESS: 'Odorless',
  MILD: 'Mild',
  SOUR: 'Sour',
  STRONG: 'Strong',
  OTHER: 'Other',
};

export function DiaperColorSwatch({ color, className }: { color: string; className?: string }) {
  const hex = (DIAPER_COLOR_HEX as Record<string, string>)[color];
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300 ${className ?? ''}`}
      style={{ backgroundColor: hex ?? '#d1d5db' }}
    />
  );
}

interface DiaperSelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function DiaperColorSelect({ id, value, onValueChange, disabled }: DiaperSelectProps) {
  const { t } = useLocalization();
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={t('Select color')} />
      </SelectTrigger>
      <SelectContent>
        {DIAPER_COLORS.map((color) => (
          <SelectItem key={color} value={color}>
            <span className="flex items-center gap-2">
              <DiaperColorSwatch color={color} />
              {t(COLOR_LABELS[color])}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DiaperSmellSelect({ id, value, onValueChange, disabled }: DiaperSelectProps) {
  const { t } = useLocalization();
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={t('Select smell')} />
      </SelectTrigger>
      <SelectContent>
        {DIAPER_SMELLS.map((smell) => (
          <SelectItem key={smell} value={smell}>
            {t(SMELL_LABELS[smell])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
