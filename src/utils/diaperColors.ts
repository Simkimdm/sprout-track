/**
 * Canonical stool color set for diaper logs, following the 24baby.de stool
 * color palette (meconium black through grey/white). Stored as uppercase
 * strings in DiaperLog.color; the hooks API exposes this same list.
 */
export const DIAPER_COLORS = [
  'BLACK',
  'GREEN',
  'GREENISH_YELLOW',
  'LIGHT_GREEN',
  'YELLOW',
  'ORANGE',
  'GREENISH_BROWN',
  'BROWN',
  'RED',
  'WHITE',
  'GREY',
  'OTHER',
] as const;

export type DiaperColor = (typeof DIAPER_COLORS)[number];

/** Swatch color per stool color, used to compare colors visually in selects. */
export const DIAPER_COLOR_HEX: Record<DiaperColor, string> = {
  BLACK: '#1f2937',
  GREEN: '#4d7c0f',
  GREENISH_YELLOW: '#a9b83c',
  LIGHT_GREEN: '#a3e635',
  YELLOW: '#eab308',
  ORANGE: '#f97316',
  GREENISH_BROWN: '#7d6b3f',
  BROWN: '#8b5e34',
  RED: '#dc2626',
  WHITE: '#f8fafc',
  GREY: '#9ca3af',
  OTHER: '#d1d5db',
};

/** Canonical stool smell set for diaper logs (DiaperLog.smell). */
export const DIAPER_SMELLS = ['ODORLESS', 'MILD', 'SOUR', 'STRONG', 'OTHER'] as const;

export type DiaperSmell = (typeof DIAPER_SMELLS)[number];
