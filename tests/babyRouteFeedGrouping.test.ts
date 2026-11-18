import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  babyFindFirst: vi.fn(),
  babyUpdate: vi.fn(),
  babyCreate: vi.fn(),
  familyFindUnique: vi.fn(),
  familyUpdate: vi.fn(),
}));

vi.mock('../app/api/db', () => ({
  default: {
    baby: {
      findFirst: mocks.babyFindFirst,
      update: mocks.babyUpdate,
      create: mocks.babyCreate,
    },
    family: {
      findUnique: mocks.familyFindUnique,
      update: mocks.familyUpdate,
    },
  },
}));

// Authenticated caretaker of family "fam-A"; withAuthContext passes the context through.
vi.mock('@/app/api/utils/auth', () => ({
  withAuthContext: (handler: any) => (req: any) =>
    handler(req, { authenticated: true, familyId: 'fam-A', isSysAdmin: false }),
}));

vi.mock('@/app/api/utils/writeProtection', () => ({
  checkWritePermission: () => ({ allowed: true }),
}));

import { GET, POST, PUT } from '../app/api/baby/route';

const putReq = (body: object) =>
  new NextRequest('http://localhost/api/baby', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const postReq = (body: object) =>
  new NextRequest('http://localhost/api/baby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const existingBaby = {
  id: 'baby-1',
  familyId: 'fam-A',
  birthDate: new Date('2026-01-01T00:00:00Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  feedSessionGroupingMinutes: 30,
};

describe('PUT /api/baby — feedSessionGroupingMinutes security & validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.babyFindFirst.mockResolvedValue(existingBaby);
    mocks.babyUpdate.mockImplementation(async ({ data }: any) => ({ ...existingBaby, ...data }));
  });

  it('accepts a valid interval and persists it (200, prisma receives the value)', async () => {
    const res = await PUT(putReq({ id: 'baby-1', feedSessionGroupingMinutes: 15 }));
    expect(res.status).toBe(200);
    expect(mocks.babyUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.babyUpdate.mock.calls[0][0].data.feedSessionGroupingMinutes).toBe(15);
  });

  it.each([-1, 1.5, 1441, '15', NaN])('rejects invalid value %s with 400 and never writes', async (value) => {
    const res = await PUT(putReq({ id: 'baby-1', feedSessionGroupingMinutes: value }));
    expect(res.status).toBe(400);
    expect(mocks.babyUpdate).not.toHaveBeenCalled();
  });

  it('accepts 0 (= auto-grouping off)', async () => {
    const res = await PUT(putReq({ id: 'baby-1', feedSessionGroupingMinutes: 0 }));
    expect(res.status).toBe(200);
    expect(mocks.babyUpdate.mock.calls[0][0].data.feedSessionGroupingMinutes).toBe(0);
  });

  it('omitting the field leaves it untouched (partial update does not reset it)', async () => {
    const res = await PUT(putReq({ id: 'baby-1', firstName: 'New' }));
    expect(res.status).toBe(200);
    expect('feedSessionGroupingMinutes' in mocks.babyUpdate.mock.calls[0][0].data).toBe(false);
  });

  it('blocks cross-family writes: body familyId of another family -> 403, no write', async () => {
    const res = await PUT(putReq({ id: 'baby-1', familyId: 'fam-B', feedSessionGroupingMinutes: 15 }));
    expect(res.status).toBe(403);
    expect(mocks.babyUpdate).not.toHaveBeenCalled();
  });

  it('blocks writes to a baby outside the caller\'s family -> 404, no write', async () => {
    mocks.babyFindFirst.mockResolvedValue(null);
    const res = await PUT(putReq({ id: 'baby-9', feedSessionGroupingMinutes: 15 }));
    expect(res.status).toBe(404);
    expect(mocks.babyUpdate).not.toHaveBeenCalled();
    // the lookup itself is family-scoped
    expect(mocks.babyFindFirst.mock.calls[0][0].where).toEqual({ id: 'baby-9', familyId: 'fam-A' });
  });
});

describe('POST /api/baby — feedSessionGroupingMinutes validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.familyFindUnique.mockResolvedValue({ id: 'fam-A', setupStage: 3 });
    mocks.babyCreate.mockImplementation(async ({ data }: any) => ({ ...data, id: 'new-baby' }));
  });

  const baseBody = {
    familyId: 'fam-A',
    firstName: 'Baby',
    lastName: 'Doe',
    birthDate: '2026-01-01T00:00:00.000Z',
    feedWarningTime: '03:00',
    diaperWarningTime: '02:00',
  };

  it('accepts a valid interval on create', async () => {
    const res = await POST(postReq({ ...baseBody, feedSessionGroupingMinutes: 15 }));
    expect(res.status).toBe(200);
    expect(mocks.babyCreate.mock.calls[0][0].data.feedSessionGroupingMinutes).toBe(15);
  });

  it.each([-1, 2.5, 5000, '15'])('rejects invalid value %s with 400 on create', async (value) => {
    const res = await POST(postReq({ ...baseBody, feedSessionGroupingMinutes: value }));
    expect(res.status).toBe(400);
    expect(mocks.babyCreate).not.toHaveBeenCalled();
  });
});

describe('GET /api/baby — family scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries babies only within the caller\'s family', async () => {
    mocks.babyFindFirst.mockResolvedValue(null);
    await GET(new NextRequest('http://localhost/api/baby?id=baby-1'));
    expect(mocks.babyFindFirst.mock.calls[0][0].where).toMatchObject({ id: 'baby-1', familyId: 'fam-A', deletedAt: null });
  });
});
