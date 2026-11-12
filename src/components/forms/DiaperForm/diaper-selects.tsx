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
  PALE_YELLOW: 'Pale Yellow',
  ORANGE: 'Orange',
  GREENISH_BROWN: 'Greenish Brown',
  BEIGE: 'Beige',
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

function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function DiaperColorSwatch({ color, className }: { color: string; className?: string }) {
  const hex = (DIAPER_COLOR_HEX as Record<string, string>)[color];
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-md border border-slate-300 transition-transform duration-150 hover:scale-150 hover:ring-2 hover:ring-slate-400 ${className ?? 'h-4 w-7'}`}
      style={{ backgroundColor: hex ?? '#d1d5db' }}
    />
  );
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
            <span className="flex items-center gap-2.5">
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
