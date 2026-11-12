/**
 * Canonical stool color set for diaper logs, following the kidygrow.com
 * stool color guide (yellow, yellow-brown, brown, green, orange, red, black,
 * white, grey). Stored as uppercase strings in DiaperLog.color; the hooks
 * API exposes this same list.
 */
export const DIAPER_COLORS = [
  'YELLOW',
  'YELLOW_BROWN',
  'BROWN',
  'GREEN',
  'ORANGE',
  'RED',
  'BLACK',
  'WHITE',
  'GREY',
  'OTHER',
] as const;

export type DiaperColor = (typeof DIAPER_COLORS)[number];

/** Swatch color per stool color, used to compare colors visually in selects. */
export const DIAPER_COLOR_HEX: Record<DiaperColor, string> = {
  YELLOW: '#eab308',
  YELLOW_BROWN: '#b08d3e',
  BROWN: '#8b5e34',
  GREEN: '#4d7c0f',
  ORANGE: '#f97316',
  RED: '#dc2626',
  BLACK: '#1f2937',
  WHITE: '#f8fafc',
  GREY: '#9ca3af',
  OTHER: '#d1d5db',
};

/** Canonical stool smell set for diaper logs (DiaperLog.smell). */
export const DIAPER_SMELLS = ['ODORLESS', 'MILD', 'SOUR', 'STRONG', 'OTHER'] as const;

export type DiaperSmell = (typeof DIAPER_SMELLS)[number];
