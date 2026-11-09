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

    const duration = calculateDurationMinutes(activeSleep.startTime, at);
    const sleepLog = await prisma.sleepLog.update({
      where: { id: activeSleep.id },
      data: { endTime: at, duration },
    });

    notifyActivityCreated(babyId, 'wake', { accountId, caretakerId }, { duration }).catch(console.error);

    return sleepLog;
  } catch (error) {
    console.error('Error auto-ending sleep on feed start:', error);
    return null;
  }
}
