import { expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { hashPassword, sha256 } from '@/lib/crypto';
import { verifyLoginAttempt } from '@/lib/login-attempts';
import { setPasswordAction } from '@/app/(auth)/actions';
import { testDb } from './helpers';

vi.mock('@/db', async () => ({ ...await vi.importActual('@/db'), getDb: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  createSession: vi.fn(async () => {}), destroySession: vi.fn(), isMasterEmail: vi.fn(() => false),
  issueAccessLink: vi.fn(), normalizeEmail: (value: string) => value.trim().toLowerCase(),
  requireUser: vi.fn(), touchSession: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('REDIRECT'); }) }));

test('four wrong passwords lock for 15 minutes; success and password reset clear the count', async () => {
  const db = await testDb();
  vi.mocked(getDb).mockResolvedValue(db);
  const [user] = await db.insert(schema.users).values({
    email: 'login@example.test', status: 'active', passwordHash: await hashPassword('original-password'),
  }).returning();
  const start = new Date('2026-11-10T12:00:00Z');
  const attempt = (password: string, minutes = 0) => verifyLoginAttempt(db, user.id, password, new Date(start.getTime() + minutes * 60_000));
  const current = async () => (await db.select().from(schema.users).where(eq(schema.users.id, user.id)))[0];

  for (let n = 1; n <= 3; n++) {
    expect(await attempt('wrong')).toBe(false);
    expect((await current()).failedLoginAttempts).toBe(n);
  }
  expect(await attempt('original-password')).toBe(true);
  expect((await current()).failedLoginAttempts).toBe(0);
  for (let n = 0; n < 4; n++) expect(await attempt('wrong')).toBe(false);
  expect((await current()).loginLockedUntil?.getTime()).toBe(start.getTime() + 15 * 60_000);
  expect(await attempt('original-password', 14)).toBe(false);
  expect(await attempt('original-password', 15)).toBe(true);
  expect((await current()).failedLoginAttempts).toBe(0);
  expect((await current()).loginLockedUntil).toBeNull();

  for (let n = 0; n < 4; n++) expect(await attempt('wrong', 16)).toBe(false);
  const token = 'reset-token';
  await db.insert(schema.authTokens).values({ id: sha256(token), userId: user.id, kind: 'reset', expiresAt: new Date(Date.now() + 60_000) });
  const form = new FormData();
  form.set('token', token);
  form.set('password', 'new-password');
  form.set('confirm', 'new-password');
  await expect(setPasswordAction(undefined, form)).rejects.toThrow('REDIRECT');
  expect((await current()).failedLoginAttempts).toBe(0);
  expect((await current()).loginLockedUntil).toBeNull();
  expect(await verifyLoginAttempt(db, user.id, 'new-password')).toBe(true);
  await db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, user.id));
  expect(await verifyLoginAttempt(db, user.id, 'new-password')).toBe(false);
});
