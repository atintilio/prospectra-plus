import { expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { importLeadsAction } from '@/app/(app)/actions';
import { seedOrg, testDb } from './helpers';

vi.mock('@/db', async () => ({ getDb: vi.fn(), schema: await import('@/db/schema') }));
vi.mock('@/lib/auth', () => ({ requireOrg: vi.fn(), requireUser: vi.fn(), requireAdmin: vi.fn(), canManage: vi.fn(), normalizeEmail: vi.fn(), issueAccessLink: vi.fn(), switchOrg: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

function form(csv: string) {
  const data = new FormData();
  data.set('file', new Blob([csv], { type: 'text/csv' }), 'contacts.csv');
  return data;
}

test('grava múltiplos contatos sem LinkedIn, deduplica reimportação e isola operações', async () => {
  const db = await testDb();
  vi.mocked(getDb).mockResolvedValue(db);
  const first = await seedOrg(db, 'Primeira');
  const setScope = (scope: typeof first) => vi.mocked(requireOrg).mockResolvedValue({ ...scope, role: 'owner', sessionId: 'test' });
  setScope(first);
  const csv = 'nome,email,telefone\nAna,ana@example.test,+55 11 99999-0000\nBruno,bruno@example.test,';
  expect((await importLeadsAction(undefined, form(csv)))?.ok).toContain('2 leads adicionados');
  const saved = await db.select().from(schema.leads).where(eq(schema.leads.orgId, first.org.id));
  expect(saved).toHaveLength(2);
  expect(saved.every(lead => lead.linkedinUrl === '')).toBe(true);
  expect(saved.map(lead => lead.email).sort()).toEqual(['ana@example.test', 'bruno@example.test']);
  expect((await importLeadsAction(undefined, form(csv.toUpperCase())))?.ok).toContain('0 leads adicionados');
  expect(await db.select().from(schema.leads).where(eq(schema.leads.orgId, first.org.id))).toHaveLength(2);
  const second = await seedOrg(db, 'Segunda');
  setScope(second);
  expect((await importLeadsAction(undefined, form(csv)))?.ok).toContain('2 leads adicionados');
});
