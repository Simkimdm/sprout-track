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
  YELLOW: 'Yellow',
  YELLOW_BROWN: 'Yellow Brown',
  BROWN: 'Brown',
  GREEN: 'Green',
  ORANGE: 'Orange',
  RED: 'Red',
  BLACK: 'Black',
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

function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Filled color chip with the label inside, like the U-Heft stool color chart. */
export function DiaperColorChip({ color, label, className }: { color: string; label: string; className?: string }) {
  const hex = (DIAPER_COLOR_HEX as Record<string, string>)[color] ?? '#d1d5db';
  const textColor = hexLuminance(hex) > 0.6 ? '#1f2937' : '#f8fafc';
  return (
    <span
      className={`inline-flex items-center rounded-md border border-slate-300 px-2.5 py-1 text-sm font-medium transition-transform duration-150 hover:scale-110 ${className ?? ''}`}
      style={{ backgroundColor: hex, color: textColor }}
    >
      {label}
    </span>
  );
}

interface DiaperSelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

/** Grid of large color circles (U-Heft chart style); click again to clear. */
export function DiaperColorPicker({ value, onValueChange, disabled }: DiaperSelectProps) {
  const { t } = useLocalization();
  return (
    <div
      className="grid grid-cols-2 gap-3 justify-items-start rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60"
      role="radiogroup"
      aria-label={t('Color')}
    >
      {DIAPER_COLORS.map((color) => {
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(COLOR_LABELS[color])}
            title={t(COLOR_LABELS[color])}
            disabled={disabled}
            onClick={() => onValueChange(selected ? '' : color)}
            className={`h-10 w-10 rounded-full border border-black/10 shadow-sm transition-all duration-150 hover:scale-110 hover:shadow-md disabled:opacity-50 dark:border-white/10 ${
              selected ? 'scale-110 ring-2 ring-slate-700 ring-offset-2 ring-offset-slate-50 dark:ring-slate-300 dark:ring-offset-slate-800' : ''
            }`}
            style={{ backgroundColor: DIAPER_COLOR_HEX[color] }}
          />
        );
      })}
    </div>
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
