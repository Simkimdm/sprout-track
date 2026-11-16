import prisma from '../db';

// Persistent, DB-backed store for failed login attempts (survives restarts
// and works across multiple app instances, unlike an in-memory Map).
// Rows carry their own expiry via expiresAt.

const KIND = 'ip_lockout';

// Maximum number of failed attempts before lockout
const MAX_ATTEMPTS = 3;
// Lockout duration in milliseconds (5 minutes)
const LOCKOUT_DURATION = 5 * 60 * 1000;

async function cleanupExpired(): Promise<void> {
  try {
    await prisma.securityEvent.deleteMany({
      where: { kind: KIND, expiresAt: { lte: new Date() } },
    });
  } catch {
    // Best effort — a failed cleanup must not break lockout logic
  }
}

/**
 * Check if an IP is currently locked out
 */
export async function checkIpLockout(ip: string): Promise<{ locked: boolean; remainingTime: number }> {
  try {
    const row = await prisma.securityEvent.findUnique({
      where: { kind_key: { kind: KIND, key: ip } },
    });

    if (!row) {
      return { locked: false, remainingTime: 0 };
    }

    if (row.locked && row.expiresAt.getTime() > Date.now()) {
      return { locked: true, remainingTime: row.expiresAt.getTime() - Date.now() };
    }

    // Lockout window or counter window elapsed — reset the counter
    if (row.expiresAt.getTime() <= Date.now()) {
      await prisma.securityEvent.update({
        where: { kind_key: { kind: KIND, key: ip } },
        data: { count: 0, locked: false },
      }).catch(() => {});
    }
    return { locked: false, remainingTime: 0 };
  } catch (error) {
    console.error('checkIpLockout error:', error);
    // Fail open: a DB hiccup must not lock out every user
    return { locked: false, remainingTime: 0 };
  }
}

/**
 * Record a failed login attempt for an IP
 */
export async function recordFailedAttempt(ip: string): Promise<{ locked: boolean; remainingTime: number }> {
  await cleanupExpired();
  try {
    const existing = await prisma.securityEvent.findUnique({
      where: { kind_key: { kind: KIND, key: ip } },
    });

    // Already locked and lockout still active
    if (existing?.locked && existing.expiresAt.getTime() > Date.now()) {
      return { locked: true, remainingTime: existing.expiresAt.getTime() - Date.now() };
    }

    const count = (existing?.count ?? 0) + 1;

    if (count >= MAX_ATTEMPTS) {
      const expiresAt = new Date(Date.now() + LOCKOUT_DURATION);
      await prisma.securityEvent.upsert({
        where: { kind_key: { kind: KIND, key: ip } },
        create: { kind: KIND, key: ip, count: 0, locked: true, expiresAt },
        update: { count: 0, locked: true, expiresAt },
      });
      return { locked: true, remainingTime: LOCKOUT_DURATION };
    }

    await prisma.securityEvent.upsert({
      where: { kind_key: { kind: KIND, key: ip } },
      create: { kind: KIND, key: ip, count, locked: false, expiresAt: new Date(Date.now() + LOCKOUT_DURATION) },
      update: { count, locked: false },
    });
    return { locked: false, remainingTime: 0 };
  } catch (error) {
    console.error('recordFailedAttempt error:', error);
    return { locked: false, remainingTime: 0 };
  }
}

/**
 * Reset failed attempts for an IP after successful login
 */
export async function resetFailedAttempts(ip: string): Promise<void> {
  try {
    await prisma.securityEvent.deleteMany({ where: { kind: KIND, key: ip } });
  } catch (error) {
    console.error('resetFailedAttempts error:', error);
  }
}
