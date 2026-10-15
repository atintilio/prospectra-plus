import 'server-only';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getDb, schema } from '@/db';
import { newToken, sha256 } from './crypto';

const COOKIE = 'prospectra_session';
const SESSION_DAYS = 14;

export type Role = 'owner' | 'manager' | 'sdr' | 'closer';
export type Ctx = {
  user: typeof schema.users.$inferSelect;
  org: typeof schema.orgs.$inferSelect | null;
  role: Role | null;
  sessionId: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isMasterEmail(email: string): boolean {
  const master = process.env.MASTER_USER_EMAIL?.trim().toLowerCase();
  return Boolean(master) && normalizeEmail(email) === master;
}

export async function createSession(userId: string, orgId: string | null): Promise<void> {
  const db = await getDb();
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(schema.sessions).values({ id: sha256(token), userId, orgId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: expiresAt });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  }
  jar.delete(COOKIE);
}

export const getCtx = cache(async (): Promise<Ctx | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())));
  if (!row || row.user.status !== 'active') return null;
  let org: Ctx['org'] = null;
  let role: Role | null = null;
  if (row.session.orgId) {
    const [m] = await db
      .select({ org: schema.orgs, role: schema.memberships.role })
      .from(schema.orgs)
      .leftJoin(schema.memberships, and(eq(schema.memberships.orgId, schema.orgs.id), eq(schema.memberships.userId, row.user.id)))
      .where(eq(schema.orgs.id, row.session.orgId));
    if (m && (m.role || row.user.platformRole === 'admin')) {
      org = m.org;
      role = (m.role as Role | null) ?? 'owner'; // admin master opera como owner em qualquer parceiro
    }
  }
  return { user: row.user, org, role, sessionId: row.session.id };
});

export async function requireUser(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect('/login');
  return ctx;
}

/** Garante usuário logado com um parceiro (org) ativo selecionado. */
export async function requireOrg(): Promise<Ctx & { org: NonNullable<Ctx['org']>; role: Role }> {
  const ctx = await requireUser();
  if (!ctx.org || !ctx.role) redirect(ctx.user.platformRole === 'admin' ? '/admin' : '/sem-equipe');
  return ctx as Ctx & { org: NonNullable<Ctx['org']>; role: Role };
}

export async function requireAdmin(): Promise<Ctx> {
  const ctx = await requireUser();
  if (ctx.user.platformRole !== 'admin') redirect('/painel');
  return ctx;
}

export function canManage(role: Role | null): boolean {
  return role === 'owner' || role === 'manager';
}

export async function switchOrg(orgId: string): Promise<void> {
  const ctx = await requireUser();
  const db = await getDb();
  if (ctx.user.platformRole !== 'admin') {
    const [m] = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, ctx.user.id)));
    if (!m) throw new Error('Sem acesso a este parceiro');
  }
  await db.update(schema.sessions).set({ orgId }).where(eq(schema.sessions.id, ctx.sessionId));
}

/** Cria token de convite/recuperação e devolve o link. */
export async function issueAccessLink(userId: string, kind: 'invite' | 'reset'): Promise<string> {
  const db = await getDb();
  const token = newToken();
  const ttl = kind === 'invite' ? 7 * 86400_000 : 30 * 60_000;
  await db.update(schema.authTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.userId, userId), isNull(schema.authTokens.usedAt)));
  await db.insert(schema.authTokens).values({ id: sha256(token), userId, kind, expiresAt: new Date(Date.now() + ttl) });
  return `${appUrl()}/definir-senha?token=${token}`;
}

export function appUrl(): string {
  return (process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}
