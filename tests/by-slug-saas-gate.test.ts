import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

const mocks = vi.hoisted(() => ({
  prisma: {
    family: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../app/api/db', () => ({ default: mocks.prisma }));
vi.mock('../prisma/log-db', () => ({ default: { apiLog: { create: vi.fn(() => Promise.resolve()) } } }));

import { GET } from '../app/api/family/by-slug/[slug]/route';

const familyRow = {
  id: 'fam1',
  name: 'Secret Family Name',
  slug: 'my-family',
  isActive: true,
  account: { betaparticipant: false, trialEnds: null, planType: 'pro', planExpires: null },
};

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/family/by-slug/my-family', { headers });

describe('GET /api/family/by-slug/[slug] SaaS tenant-data gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.DEPLOYMENT_MODE = 'saas';
    mocks.prisma.family.findFirst.mockResolvedValue(familyRow);
    mocks.prisma.family.findUnique.mockResolvedValue(null);
  });

  it('unauthenticated in SaaS mode: only slug existence, no name/id/account status', async () => {
    const res = await GET(req(), { params: Promise.resolve({ slug: 'my-family' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ slug: 'my-family', exists: true });
    expect(JSON.stringify(body)).not.toContain('Secret Family Name');
  });

  it('authenticated in SaaS mode: full public payload', async () => {
    const token = jwt.sign(
      { id: 'c1', name: 'c', type: 'ADMIN', role: 'ADMIN', familyId: 'fam1', familySlug: 'my-family' },
      'test-secret'
    );
    const res = await GET(req({ authorization: `Bearer ${token}` }), { params: Promise.resolve({ slug: 'my-family' }) });
    const body = await res.json();
    expect(body.data.name).toBe('Secret Family Name');
    expect(body.data.accountStatus).toBeDefined();
  });

  it('self-hosted mode stays unchanged (single household)', async () => {
    process.env.DEPLOYMENT_MODE = 'selfhosted';
    const res = await GET(req(), { params: Promise.resolve({ slug: 'my-family' }) });
    const body = await res.json();
    expect(body.data.name).toBe('Secret Family Name');
  });
});
