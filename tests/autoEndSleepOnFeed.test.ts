import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirstSettings, findFirstSleepLog, updateSleepLog, notifyActivityCreated } = vi.hoisted(() => ({
  findFirstSettings: vi.fn(),
  findFirstSleepLog: vi.fn(),
  updateSleepLog: vi.fn(),
  notifyActivityCreated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/app/api/db', () => ({
  default: {
    settings: { findFirst: findFirstSettings },
    sleepLog: { findFirst: findFirstSleepLog, update: updateSleepLog },
  },
}));

vi.mock('@/src/lib/notifications/activityHook', () => ({
  notifyActivityCreated,
}));

import { maybeEndActiveSleepOnFeed } from '@/app/api/utils/autoEndSleep';

describe('maybeEndActiveSleepOnFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when the setting is disabled (default)', async () => {
    findFirstSettings.mockResolvedValue({ autoEndSleepOnFeed: false });

    const result = await maybeEndActiveSleepOnFeed({
      babyId: 'baby1',
      familyId: 'fam1',
      at: new Date('2026-11-20T12:00:00Z'),
    });

    expect(result).toBeNull();
    expect(findFirstSleepLog).not.toHaveBeenCalled();
    expect(updateSleepLog).not.toHaveBeenCalled();
  });

  it('does nothing when no active sleep session exists', async () => {
    findFirstSettings.mockResolvedValue({ autoEndSleepOnFeed: true });
    findFirstSleepLog.mockResolvedValue(null);

    const result = await maybeEndActiveSleepOnFeed({
      babyId: 'baby1',
      familyId: 'fam1',
      at: new Date('2026-11-20T12:00:00Z'),
    });

    expect(result).toBeNull();
    expect(updateSleepLog).not.toHaveBeenCalled();
  });

  it('ends the active sleep at the feed start time and computes duration', async () => {
    const at = new Date('2026-11-20T12:30:00Z');
    findFirstSettings.mockResolvedValue({ autoEndSleepOnFeed: true });
    findFirstSleepLog.mockResolvedValue({ id: 'sleep1', babyId: 'baby1', startTime: new Date('2026-11-20T11:00:00Z') });
    updateSleepLog.mockResolvedValue({ id: 'sleep1', endTime: at, duration: 90 });

    const result = await maybeEndActiveSleepOnFeed({
      babyId: 'baby1',
      familyId: 'fam1',
      at,
      caretakerId: 'care1',
    });

    expect(findFirstSleepLog).toHaveBeenCalledWith({
      where: { babyId: 'baby1', endTime: null, deletedAt: null },
      orderBy: { startTime: 'desc' },
    });
    expect(updateSleepLog).toHaveBeenCalledWith({
      where: { id: 'sleep1' },
      data: { endTime: at, duration: 90 },
    });
    expect(result).toEqual({ id: 'sleep1', endTime: at, duration: 90 });
    expect(notifyActivityCreated).toHaveBeenCalledWith('baby1', 'wake', { accountId: undefined, caretakerId: 'care1' }, { duration: 90 });
  });

  it('never throws when the database lookup fails', async () => {
    findFirstSettings.mockRejectedValue(new Error('db down'));

    const result = await maybeEndActiveSleepOnFeed({
      babyId: 'baby1',
      familyId: 'fam1',
      at: new Date('2026-11-20T12:00:00Z'),
    });

    expect(result).toBeNull();
  });
});
