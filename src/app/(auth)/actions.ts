'use server';

import { and, eq, gt, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb, schema } from '@/db';
import { createSession, destroySession, isMasterEmail, issueAccessLink, normalizeEmail, requireUser, touchSession } from '@/lib/auth';
import { hashPassword, sha256, verifyPassword } from '@/lib/crypto';
import { sendAccessEmail } from '@/lib/mailer';
import { findLegacyUser } from '@/lib/legacy';
import { ensureMasterOrg, ensureTeam } from '@/lib/membership';
import { verifyLoginAttempt } from '@/lib/login-attempts';

export type FormState = { error?: string; ok?: string } | undefined;

async function firstOrgOf(userId: string): Promise<string | null> {
  const db = await getDb();
  const [m] = await db.select({ orgId: schema.memberships.orgId }).from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.orgs.active, true), eq(schema.orgs.isDemo, false)))
    .orderBy(schema.memberships.createdAt).limit(1);
  return m?.orgId ?? null;
}

/**
 * Operação de entrada depois do login: a de produção quando existe; senão a
 * demonstração (quem só tem a demo entra direto nela, sem tela de ambiente).
 */
async function entryOrgOf(userId: string): Promise<string | null> {
  const prod = await firstOrgOf(userId);
  if (prod) return prod;
  const db = await getDb();
  const [m] = await db.select({ orgId: schema.memberships.orgId }).from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.orgs.isDemo, true)))
    .orderBy(schema.memberships.createdAt).limit(1);
  return m?.orgId ?? null;
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = normalizeEmail(String(form.get('email') ?? ''));
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Informe e-mail e senha.' };
  try {
    const db = await getDb();
    let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (user?.status === 'disabled') return { error: 'E-mail ou senha incorretos.' };
    let legacy: Awaited<ReturnType<typeof findLegacyUser>> = null;
    if (!user) {
      // conta do v1: traz (ou restaura) usuário + hash da senha antiga, sem exigir troca de senha
      legacy = await findLegacyUser(email);
      if (legacy?.passwordHash && (await verifyPassword(password, legacy.passwordHash))) {
        user = user ?? (isMasterEmail(email) ? await ensureMaster(email) : (await db.insert(schema.users).values({ email, name: legacy.name ?? '', status: 'invited' }).returning())[0]);
        [user] = await db.update(schema.users).set({ passwordHash: legacy.passwordHash, status: 'active', ...(legacy.name && !user.name ? { name: legacy.name } : {}) }).where(eq(schema.users.id, user.id)).returning();
      }
    }
    if (!user || !(await verifyLoginAttempt(db, user.id, password))) {
      return { error: 'E-mail ou senha incorretos.' };
    }
    if (isMasterEmail(email)) {
      // O master precisa de operação + equipe para entrar: garante sempre (o banco pode
      // ter sido recriado e as operações perdidas — sem isso o login cai em /sem-equipe).
      await ensureMaster(email);
      [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    } else if (user.platformRole !== 'admin') {
      // conta migrada do v1 chega sem equipe: coloca na equipe padrão com o papel equivalente
      legacy = legacy ?? (await findLegacyUser(email));
      if (legacy) await ensureTeam(db, user.id, legacy.role);
    }
    await createSession(user.id, await entryOrgOf(user.id));
  } catch (e) {
    console.error('login failed', e);
    return { error: 'Não foi possível entrar agora. Tente novamente em instantes.' };
  }
  // Entra direto na operação: a tela /ambiente continua existindo, mas quem
  // entra no Prospectra cai no painel (o ambiente troca-se pelo botão do topo).
  redirect('/painel');
}

/** Garante o usuário master e o parceiro "Argus Prime" no primeiro acesso. */
async function ensureMaster(email: string) {
  const db = await getDb();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) {
    if (existing.platformRole !== 'admin') await db.update(schema.users).set({ platformRole: 'admin' }).where(eq(schema.users.id, existing.id));
    // Sem operação (tabelas recriadas após incidente) o master entra sem parceiro e
    // cai em /sem-equipe. Garante a operação e a equipe de dono.
    await ensureMasterOrg(db, existing.id);
    return existing;
  }
  const [user] = await db.insert(schema.users).values({ email, name: 'Administrador', platformRole: 'admin', status: 'invited' }).returning();
  const [org] = await db.insert(schema.orgs).values({ name: 'Argus Prime', seats: 50, searchCreditsMonth: 5000 }).returning();
  await db.insert(schema.memberships).values({ orgId: org.id, userId: user.id, role: 'owner' });
  return user;
}

export async function requestResetAction(_: FormState, form: FormData): Promise<FormState> {
  const email = normalizeEmail(String(form.get('email') ?? ''));
  if (!email.includes('@')) return { error: 'Informe um e-mail válido.' };
  try {
    const db = await getDb();
    const user = isMasterEmail(email) ? await ensureMaster(email) : (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0];
    if (user && user.status !== 'disabled') {
      const link = await issueAccessLink(user.id, 'reset');
      await sendAccessEmail(user.email, link, { kind: 'reset', name: user.name });
    }
  } catch (e) {
    console.error('reset email failed', e);
    return { error: 'Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.' };
  }
  // Resposta igual para e-mails existentes ou não (não revela quem tem acesso)
  return { ok: 'Se este e-mail tiver acesso, você vai receber um link em instantes.' };
}

export async function setPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get('token') ?? '');
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  const name = String(form.get('name') ?? '').trim();
  if (password.length < 10) return { error: 'A senha precisa ter pelo menos 10 caracteres.' };
  if (password !== confirm) return { error: 'As senhas não conferem.' };
  const db = await getDb();
  const [row] = await db.select().from(schema.authTokens)
    .where(and(eq(schema.authTokens.id, sha256(token)), isNull(schema.authTokens.usedAt), gt(schema.authTokens.expiresAt, new Date())));
  if (!row) return { error: 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".' };
  await db.update(schema.authTokens).set({ usedAt: new Date() }).where(eq(schema.authTokens.id, row.id));
  await db.update(schema.users)
    .set({ passwordHash: await hashPassword(password), status: 'active', failedLoginAttempts: 0, loginLockedUntil: null, ...(name ? { name } : {}) })
    .where(eq(schema.users.id, row.userId));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, row.userId));
  await createSession(row.userId, await entryOrgOf(row.userId));
  redirect('/painel');
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}

/** Batida: renova a sessao enquanto a pessoa usa o Prospectra. */
export async function touchSessionAction(): Promise<void> {
  const ctx = await requireUser();
  await touchSession(ctx.sessionId);
}

