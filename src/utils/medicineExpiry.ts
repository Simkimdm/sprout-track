export const MEDICINE_EXPIRY_WARNING_DAYS = 14;

export type MedicineExpiryStatus = 'none' | 'ok' | 'expiring-soon' | 'expired';

export interface MedicineExpiryInfo {
  status: MedicineExpiryStatus;
  /** Whole calendar days until expiry; 0 = expires today, negative = days overdue */
  daysRemaining: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Compute the expiry status of a medicine/supplement package.
 * Comparison is done on calendar days (local time), so a package expiring
 * today still counts as "expiring soon" with 0 days remaining.
 */
export function getMedicineExpiryInfo(
  expiryDate: Date | string | null | undefined,
  now: Date = new Date(),
  warningDays: number = MEDICINE_EXPIRY_WARNING_DAYS
): MedicineExpiryInfo {
  if (!expiryDate) {
    return { status: 'none', daysRemaining: null };
  }

  const expiry = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate;
  if (isNaN(expiry.getTime())) {
    return { status: 'none', daysRemaining: null };
  }

  const daysRemaining = Math.round((startOfDayMs(expiry) - startOfDayMs(now)) / DAY_MS);

  if (daysRemaining < 0) {
    return { status: 'expired', daysRemaining };
  }
  if (daysRemaining <= warningDays) {
    return { status: 'expiring-soon', daysRemaining };
  }
  return { status: 'ok', daysRemaining };
}

/**
 * Convert an ISO date string (as returned by the API) to the yyyy-MM-dd
 * format required by <input type="date">. Returns '' for missing/invalid input.
 */
export function toDateInputValue(expiryDate: string | Date | null | undefined): string {
  if (!expiryDate) return '';
  const date = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate;
  if (isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert a yyyy-MM-dd date input value to an ISO string for the API.
 * Returns null for empty input so the field can be cleared.
 */
export function fromDateInputValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}
