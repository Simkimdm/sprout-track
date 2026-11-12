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
  YELLOW: '#f2c94c',
  YELLOW_BROWN: '#c19a5b',
  BROWN: '#8a5a33',
  GREEN: '#7fa653',
  ORANGE: '#ee8f4d',
  RED: '#d64545',
  BLACK: '#2d2a26',
  WHITE: '#f7f5ef',
  GREY: '#a9a9a1',
  OTHER: '#d1d5db',
};

/** Canonical stool smell set for diaper logs (DiaperLog.smell). */
export const DIAPER_SMELLS = ['ODORLESS', 'MILD', 'SOUR', 'STRONG', 'OTHER'] as const;

export type DiaperSmell = (typeof DIAPER_SMELLS)[number];
