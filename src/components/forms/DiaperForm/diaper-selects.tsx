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
import { DIAPER_COLORS, DIAPER_COLOR_BG, DIAPER_SMELLS, DiaperColor } from '@/src/utils/diaperColors';

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

function hexLuminance(background: string): number {
  const match = background.match(/#[0-9a-fA-F]{6}/);
  if (!match) return 0.5;
  const hex = match[0];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Filled color chip with the label inside, like the U-Heft stool color chart. */
export function DiaperColorChip({ color, label, className }: { color: string; label: string; className?: string }) {
  const background = (DIAPER_COLOR_BG as Record<string, string>)[color] ?? 'linear-gradient(135deg, #D8D8D8, #BDBDBD)';
  const textColor = hexLuminance(background) > 0.6 ? '#1f2937' : '#f8fafc';
  return (
    <span
      className={`inline-flex items-center rounded-md border border-slate-300 px-2.5 py-1 text-sm font-medium transition-transform duration-150 hover:scale-110 ${className ?? ''}`}
      style={{ background, color: textColor }}
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

/** Grid of gradient tiles (U-Heft chart style); click again to clear. */
export function DiaperColorPicker({ value, onValueChange, disabled }: DiaperSelectProps) {
  const { t } = useLocalization();
  return (
    <div
      className="grid grid-cols-2 gap-3"
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
            className={`h-11 w-full rounded-xl border border-black/10 shadow-sm transition-all duration-150 hover:scale-[1.03] hover:shadow-md disabled:opacity-50 dark:border-white/10 ${
              selected ? 'scale-[1.03] ring-2 ring-slate-700 ring-offset-2 dark:ring-slate-300' : ''
            }`}
            style={{ background: DIAPER_COLOR_BG[color] }}
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
