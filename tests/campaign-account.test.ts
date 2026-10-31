import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { seedOrg, testDb } from './helpers';
import { saveCampaignAction } from '@/app/(app)/actions';
import { connectAccount, disconnectAccount } from '@/lib/linkedin';

vi.mock('@/db', async () => ({ ...await vi.importActual('@/db'), getDb: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireOrg: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const base = { aiBrief: '', steps: [{ id: 's1', type: 'invite', delayDays: 0, condition: 'always', template: 'Olá', useAi: false }] } as const;

let db: Awaited<ReturnType<typeof testDb>>; let owner: Awaited<ReturnType<typeof seedOrg>>; let donor: Awaited<ReturnType<typeof seedOrg>>;

beforeEach(async () => {
  vi.stubEnv('SECRETS_KEY', 'chave-oficial-do-ambiente-de-teste');
  db = await testDb();
  owner = await seedOrg(db, 'Dono');
  donor = await seedOrg(db, 'OutraOrg');
  vi.mocked(getDb).mockResolvedValue(db);
  vi.mocked(requireOrg).mockResolvedValue({ user: owner.user, org: owner.org, role: 'owner', sessionId: 'test' } as any);
});
afterEach(() => vi.unstubAllEnvs());

test('campanha salva com conta conectada do próprio executor', async () => {
  const { account } = await connectAccount(db, owner.org.id, owner.user.id, true, {});
  const r = await saveCampaignAction(null, { name: 'Minha campanha', assignedTo: owner.user.id, linkedinAccountId: account.id, ...base });
  expect(r.error).toBeUndefined();
  expect(r.id).toBeTruthy();
  const [row] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, r.id!));
  expect(row.linkedinAccountId).toBe(account.id);
  expect(row.orgId).toBe(owner.org.id);
});

test('recusa conta que não está conectada', async () => {
  const { account } = await connectAccount(db, owner.org.id, owner.user.id, true, {});
  await disconnectAccount(db, owner.org.id, owner.user.id);
  const r = await saveCampaignAction(null, { name: 'Segunda', assignedTo: owner.user.id, linkedinAccountId: account.id, ...base });
  expect(r.error).toContain('não está conectada');
  expect(await db.select().from(schema.campaigns)).toHaveLength(0);
});

test('recusa conta de outro usuário, mesmo na mesma organização', async () => {
  const [member] = await db.insert(schema.users).values({ email: 'membro@x.com', name: 'Membro', status: 'active' }).returning();
  await db.insert(schema.memberships).values({ orgId: owner.org.id, userId: member.id, role: 'sdr' });
  const { account } = await connectAccount(db, owner.org.id, owner.user.id, true, {});
  const r = await saveCampaignAction(null, { name: 'Terceira', assignedTo: member.id, linkedinAccountId: account.id, ...base });
  expect(r.error).toContain('precisa pertencer a quem executa');
});

test('recusa conta de outra organização (isolamento)', async () => {
  const { account } = await connectAccount(db, donor.org.id, donor.user.id, true, {});
  const r = await saveCampaignAction(null, { name: 'Quarta', assignedTo: owner.user.id, linkedinAccountId: account.id, ...base });
  expect(r.error).toContain('inválida para esta organização');
});
