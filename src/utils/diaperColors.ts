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

/** Swatch background per stool color (kidygrow.com gradients), used to compare colors visually. */
export const DIAPER_COLOR_BG: Record<DiaperColor, string> = {
  YELLOW: 'linear-gradient(135deg, #F5E08C, #E8C868)',
  YELLOW_BROWN: 'linear-gradient(135deg, #D4A574, #B68658)',
  BROWN: 'linear-gradient(135deg, #8B6F47, #6A5333)',
  GREEN: 'linear-gradient(135deg, #6B9B57, #4F7A3F)',
  ORANGE: 'linear-gradient(135deg, #E89858, #D17836)',
  RED: 'linear-gradient(135deg, #C8443B, #8E2A22)',
  BLACK: 'linear-gradient(135deg, #2D2D2D, #0F0F0F)',
  WHITE: 'linear-gradient(135deg, #FDFCF8, #EDEBE2)',
  GREY: 'linear-gradient(135deg, #EFEEE6, #D8D6CA)',
  OTHER: 'linear-gradient(135deg, #D8D8D8, #BDBDBD)',
};

/** Canonical stool smell set for diaper logs (DiaperLog.smell). */
export const DIAPER_SMELLS = ['ODORLESS', 'MILD', 'SOUR', 'STRONG', 'OTHER'] as const;

export type DiaperSmell = (typeof DIAPER_SMELLS)[number];
