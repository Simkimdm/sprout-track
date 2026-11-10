import prisma from '../db';
import { calculateDurationMinutes } from './timezone';
import { notifyActivityCreated } from '@/src/lib/notifications/activityHook';

interface AutoEndSleepOnFeedParams {
  babyId: string;
  familyId: string | null | undefined;
  at: Date;
  accountId?: string | null;
  caretakerId?: string | null;
}

/**
 * Ends the baby's active sleep session when the family enabled
 * autoEndSleepOnFeed in settings. Returns the updated sleep log, or null
 * when the setting is off or no sleep session is active. Never throws —
 * auto-ending must not fail the feeding that triggered it.
 */
export async function maybeEndActiveSleepOnFeed({ babyId, familyId, at, accountId, caretakerId }: AutoEndSleepOnFeedParams) {
  try {
    if (!familyId) return null;
    const settings = await prisma.settings.findFirst({
      where: { familyId },
      select: { autoEndSleepOnFeed: true },
    });
    if (!settings?.autoEndSleepOnFeed) return null;

    const activeSleep = await prisma.sleepLog.findFirst({
      where: { babyId, endTime: null, deletedAt: null },
      orderBy: { startTime: 'desc' },
    });
    if (!activeSleep) return null;

    // End the sleep one minute before the feeding starts so the sleep
    // always sorts before the feed in the log. Never earlier than the
    // sleep start itself.
    const endAt = new Date(at.getTime() - 60_000);
    const effectiveEnd = endAt > activeSleep.startTime ? endAt : activeSleep.startTime;
    const duration = calculateDurationMinutes(activeSleep.startTime, effectiveEnd);
    const sleepLog = await prisma.sleepLog.update({
      where: { id: activeSleep.id },
      data: { endTime: effectiveEnd, duration },
    });

    notifyActivityCreated(babyId, 'wake', { accountId, caretakerId }, { duration }).catch(console.error);

    return sleepLog;
  } catch (error) {
    console.error('Error auto-ending sleep on feed start:', error);
    return null;
  }
}
