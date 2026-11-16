import { describe, it, expect } from 'vitest';
import {
  OZ_TO_ML,
  ML_TO_OZ,
  SUPPORTED_VOLUME_UNITS,
  normalizeVolumeUnit,
  convertVolume,
} from '@/src/utils/unit-conversion';

describe('conversion constants', () => {
  it('uses the standard US fluid ounce in ml', () => {
    expect(OZ_TO_ML).toBeCloseTo(29.5735, 6);
  });

  it('derives ML_TO_OZ as the exact inverse of OZ_TO_ML', () => {
    expect(ML_TO_OZ).toBeCloseTo(1 / 29.5735, 10);
    expect(OZ_TO_ML * ML_TO_OZ).toBeCloseTo(1, 10);
  });

  it('supports exactly OZ and ML', () => {
    expect(SUPPORTED_VOLUME_UNITS).toEqual(['OZ', 'ML']);
  });
});

describe('normalizeVolumeUnit', () => {
  it('falls back to OZ for missing or blank input', () => {
    expect(normalizeVolumeUnit(undefined)).toBe('OZ');
    expect(normalizeVolumeUnit(null)).toBe('OZ');
    expect(normalizeVolumeUnit('')).toBe('OZ');
    expect(normalizeVolumeUnit('   ')).toBe('OZ');
  });

  it('normalizes case and whitespace', () => {
    expect(normalizeVolumeUnit('oz')).toBe('OZ');
    expect(normalizeVolumeUnit('Oz')).toBe('OZ');
    expect(normalizeVolumeUnit(' ml ')).toBe('ML');
    expect(normalizeVolumeUnit('mL')).toBe('ML');
  });

  it('accepts the supported units in canonical form', () => {
    expect(normalizeVolumeUnit('OZ')).toBe('OZ');
    expect(normalizeVolumeUnit('ML')).toBe('ML');
  });

  it('returns null for unsupported units', () => {
    expect(normalizeVolumeUnit('L')).toBeNull();
    expect(normalizeVolumeUnit('gallon')).toBeNull();
    expect(normalizeVolumeUnit('cup')).toBeNull();
  });
});

describe('convertVolume', () => {
  it('returns the amount unchanged when units match', () => {
    expect(convertVolume(120, 'ML', 'ML')).toBe(120);
    expect(convertVolume(4, 'OZ', 'OZ')).toBe(4);
  });

  it('converts OZ to ML', () => {
    expect(convertVolume(1, 'OZ', 'ML')).toBeCloseTo(29.5735, 6);
    expect(convertVolume(4, 'OZ', 'ML')).toBeCloseTo(118.294, 3);
    expect(convertVolume(0, 'OZ', 'ML')).toBe(0);
  });

  it('converts ML to OZ', () => {
    expect(convertVolume(29.5735, 'ML', 'OZ')).toBeCloseTo(1, 6);
    expect(convertVolume(120, 'ML', 'OZ')).toBeCloseTo(4.0577, 3);
  });

  it('is case-insensitive', () => {
    expect(convertVolume(2, 'oz', 'ml')).toBeCloseTo(59.147, 3);
    expect(convertVolume(59.147, 'Ml', 'oZ')).toBeCloseTo(2, 3);
    expect(convertVolume(5, 'oz', 'oz')).toBe(5);
  });

  it('returns the amount unchanged for unsupported units', () => {
    expect(convertVolume(5, 'L', 'ML')).toBe(5);
    expect(convertVolume(5, 'OZ', 'L')).toBe(5);
  });

  it('round-trips OZ -> ML -> OZ', () => {
    expect(convertVolume(convertVolume(3.5, 'OZ', 'ML'), 'ML', 'OZ')).toBeCloseTo(3.5, 6);
  });

  it('round-trips ML -> OZ -> ML', () => {
    expect(convertVolume(convertVolume(100, 'ML', 'OZ'), 'OZ', 'ML')).toBeCloseTo(100, 4);
  });
});
