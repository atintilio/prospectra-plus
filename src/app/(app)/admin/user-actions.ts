'use server';
import { and, count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import { requireAdmin, normalizeEmail, issueAccessLink } from '@/lib/auth';
import { canChangeUser } from '@/lib/admin-policy';
import { sendAccessEmail } from '@/lib/mailer';

type Result = { error?: string; ok?: string } | undefined;
const memberRole = z.enum(['owner', 'manager', 'sdr', 'closer']);
const userInput = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(100), email: z.string().email(), orgId: z.string().uuid(), role: memberRole, platformRole: z.enum(['admin', 'user']) });

export async function saveAdminUserAction(_: Result, form: FormData): Promise<Result> {
  const ctx = await requireAdmin();
  const parsed = userInput.safeParse({ id: form.get('id') || undefined, name: form.get('name'), email: normalizeEmail(String(form.get('email') || '')), orgId: form.get('orgId'), role: form.get('role'), platformRole: form.get('platformRole') });
  if (!parsed.success) return { error: 'Confira nome, e-mail, equipe e permissões.' };
  const data = parsed.data;
  const db = await getDb();
  let invite: { id: string; email: string; name: string; orgName: string } | undefined;
  const result = await db.transaction(async tx => {
    const [org] = await tx.select().from(schema.orgs).where(eq(schema.orgs.id, data.orgId)).for('update');
    if (!org || org.isDemo || !org.active) return { error: 'Escolha uma equipe de produção ativa.' };
    let [user] = await tx.select().from(schema.users).where(data.id ? eq(schema.users.id, data.id) : eq(schema.users.email, data.email));
    if (data.id && !user) return { error: 'Usuário não encontrado.' };
    if (user && !canChangeUser(ctx.user, user)) return { error: 'A conta master e a própria conta são protegidas.' };
    if (user && data.email !== user.email) return { error: 'O e-mail identifica a conta e não pode ser alterado neste formulário.' };
    if (data.platformRole === 'admin' && ctx.user.platformRole !== 'admin') return { error: 'Sem permissão.' };
    const [membership] = user ? await tx.select().from(schema.memberships).where(and(eq(schema.memberships.orgId, org.id), eq(schema.memberships.userId, user.id))) : [];
    if (!membership) {
      const [{ n }] = await tx.select({ n: count() }).from(schema.memberships).where(eq(schema.memberships.orgId, org.id));
      if (n >= org.seats) return { error: 'Limite de usuários atingido. Ajuste a cota da equipe.' };
    }
    if (!user) [user] = await tx.insert(schema.users).values({ name: data.name, email: data.email, platformRole: data.platformRole, status: 'invited' }).returning();
    else await tx.update(schema.users).set({ name: data.name, platformRole: data.platformRole }).where(eq(schema.users.id, user.id));
    await tx.insert(schema.memberships).values({ orgId: org.id, userId: user.id, role: data.role }).onConflictDoUpdate({ target: [schema.memberships.orgId, schema.memberships.userId], set: { role: data.role } });
    if (user.status === 'invited') invite = { id: user.id, email: user.email, name: data.name, orgName: org.name };
    return { ok: 'Usuário e permissões salvos.' };
  });
  revalidatePath('/admin'); revalidatePath('/equipe'); revalidatePath('/', 'layout');
  if (invite) {
    try { await sendAccessEmail(invite.email, await issueAccessLink(invite.id, 'invite'), { kind: 'invite', name: invite.name, orgName: invite.orgName }); }
    catch { return { error: 'Usuário salvo, mas o convite não foi enviado. Use Reenviar acesso.' }; }
  }
  return result;
}

export async function adminAccessEmailAction(userId: string): Promise<Result> {
  const ctx = await requireAdmin(); const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, z.string().uuid().parse(userId)));
  if (!user || !canChangeUser(ctx.user, user) || user.status === 'disabled') return { error: 'Conta protegida, bloqueada ou inexistente.' };
  const kind = user.status === 'active' ? 'reset' : 'invite';
  try { await sendAccessEmail(user.email, await issueAccessLink(user.id, kind), { kind, name: user.name }); return { ok: 'E-mail de acesso enviado.' }; }
  catch { return { error: 'Não foi possível enviar o e-mail de acesso.' }; }
}

export async function adminStatusAction(userId: string, status: 'active' | 'disabled'): Promise<Result> {
  const ctx = await requireAdmin(); const db = await getDb();
  if (!['active', 'disabled'].includes(status)) return { error: 'Status inválido.' };
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, z.string().uuid().parse(userId)));
  if (!user || !canChangeUser(ctx.user, user)) return { error: 'A conta master e a própria conta são protegidas.' };
  if (status === 'active' && !user.passwordHash) return { error: 'Reenvie o convite para que o usuário defina sua senha.' };
  await db.transaction(async tx => {
    await tx.update(schema.users).set({ status }).where(eq(schema.users.id, userId));
    if (status === 'disabled') {
      await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
      await tx.update(schema.authTokens).set({ usedAt: new Date() }).where(eq(schema.authTokens.userId, userId));
    }
  });
  revalidatePath('/admin'); revalidatePath('/equipe'); return { ok: status === 'disabled' ? 'Acesso removido; dados preservados.' : 'Usuário reativado.' };
}
