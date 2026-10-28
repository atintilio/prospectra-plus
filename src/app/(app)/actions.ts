'use server';

import { and, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import type { CampaignStep } from '@/db/schema';
import { aiGenerator, planSearch, type SearchPlan } from '@/lib/ai';
import { canManage, normalizeEmail, issueAccessLink, requireAdmin, requireOrg, requireUser, switchOrg } from '@/lib/auth';
import { completeAction, enrollLeads, markOutcome, runScheduler, type Outcome } from '@/lib/cadence';
import { adminReplyProduct, adminSetProductStatus, assignConversation, openInternalTicket, replyToConversation, setConversationLabels, setConversationStatus } from '@/lib/support';
import { sendSupportMail } from '@/lib/mailer';
import { AkgGateway, akgConfig } from '@/lib/whatsapp/akg';
import { deleteArticle, setArticleStatus, upsertArticle } from '@/lib/help';
import { assignTask, createTask, deleteDoc, deleteTask, setTaskStatus, upsertDoc } from '@/lib/workspace';
import { confirmMeetingAndInvite, cancelMeeting } from '@/lib/scheduling';
import type { TaskStatus } from '@/db/schema';

const ARGUS_SUPPORT = [process.env.MASTER_USER_EMAIL || 'atintilio@argusprime.com.br', 'mloro@argusprime.com.br'];
import { leadsFromCsv, leadsFromUrls, normalizeLinkedinUrl, type ParsedLead } from '@/lib/leads-import';
import { sendAccessEmail } from '@/lib/mailer';
import { canChangeUser } from '@/lib/admin-policy';
import { deleteAuditedLeads, flushDeletionReports } from '@/lib/deletion-audit';
import { ensureDemo } from '@/lib/demo';
import { addSearchResults, searchDemoLeads, seedFeed, simulateCycle } from '@/lib/demo-sim';

type State = { error?: string; ok?: string } | undefined;

export async function switchOrgAction(orgId: string) {
  await switchOrg(orgId);
  revalidatePath('/', 'layout');
  redirect('/painel');
}

export async function chooseEnvAction(form: FormData) {
  const ctx = await requireUser();
  const db = await getDb();
  if (form.get('env') === 'demo') {
    const orgId = await ensureDemo(db, { id: ctx.user.id, name: ctx.user.name });
    await switchOrg(orgId);
  } else {
    const [m] = ctx.user.platformRole === 'admin'
      ? await db.select({ id: schema.orgs.id }).from(schema.orgs).where(eq(schema.orgs.isDemo, false)).orderBy(schema.orgs.createdAt).limit(1)
      : await db.select({ id: schema.orgs.id }).from(schema.memberships).innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
          .where(and(eq(schema.memberships.userId, ctx.user.id), eq(schema.orgs.isDemo, false), eq(schema.orgs.active, true))).orderBy(schema.memberships.createdAt).limit(1);
    if (!m) redirect('/sem-equipe');
    await switchOrg(m.id);
  }
  revalidatePath('/', 'layout');
  redirect('/painel');
}

// ---------- Leads ----------

async function insertLeads(orgId: string, ownerId: string, parsed: ParsedLead[], source: 'import' | 'search' | 'manual', tag: string) {
  const db = await getDb();
  let added = 0;
  for (let i = 0; i < parsed.length; i += 200) {
    const chunk = parsed.slice(i, i + 200).map((l) => ({ ...l, orgId, ownerId, source, tag }));
    const res = await db.insert(schema.leads).values(chunk).onConflictDoNothing().returning({ id: schema.leads.id });
    added += res.length;
  }
  return added;
}

export async function importLeadsAction(_: State, form: FormData): Promise<State> {
  const ctx = await requireOrg();
  const tag = String(form.get('tag') ?? '').trim().slice(0, 40);
  const file = form.get('file');
  const urls = String(form.get('urls') ?? '');
  let parsed: ParsedLead[] = [];
  let invalid = 0;
  if (file instanceof File && file.size > 0) {
    if (file.size > 5_000_000) return { error: 'Arquivo acima de 5 MB.' };
    const r = leadsFromCsv(await file.text());
    parsed = r.leads; invalid += r.invalid;
  }
  if (urls.trim()) {
    const r = leadsFromUrls(urls);
    parsed = [...parsed, ...r.leads]; invalid += r.invalid;
  }
  if (!parsed.length) return { error: 'Nenhum perfil do LinkedIn encontrado. O CSV precisa de uma coluna com a URL do perfil.' };
  const added = await insertLeads(ctx.org.id, ctx.user.id, parsed, 'import', tag);
  revalidatePath('/leads');
  const dup = parsed.length - added;
  return { ok: `${added} lead${added === 1 ? '' : 's'} adicionado${added === 1 ? '' : 's'}.${dup ? ` ${dup} já estava${dup === 1 ? '' : 'm'} na base.` : ''}${invalid ? ` ${invalid} linha(s) sem perfil válido.` : ''}` };
}

export async function addLeadAction(_: State, form: FormData): Promise<State> {
  const ctx = await requireOrg();
  const url = normalizeLinkedinUrl(String(form.get('linkedinUrl') ?? ''));
  const fullName = String(form.get('fullName') ?? '').trim();
  if (!url) return { error: 'Cole a URL do perfil (linkedin.com/in/...).' };
  if (!fullName) return { error: 'Informe o nome.' };
  const added = await insertLeads(ctx.org.id, ctx.user.id, [{
    linkedinUrl: url, fullName,
    headline: String(form.get('headline') ?? '').trim(), company: String(form.get('company') ?? '').trim(), location: String(form.get('location') ?? '').trim(),
  }], form.get('source') === 'search' ? 'search' : 'manual', String(form.get('tag') ?? '').trim().slice(0, 40));
  revalidatePath('/leads');
  return added ? { ok: `${fullName} adicionado.` } : { error: 'Este perfil já está na base.' };
}

export async function updateLeadStageAction(leadId: string, outcome: Outcome) {
  const ctx = await requireOrg();
  const db = await getDb();
  await markOutcome(db, ctx.org.id, ctx.user.id, leadId, outcome);
  revalidatePath('/leads'); revalidatePath('/fila'); revalidatePath('/painel');
}

export async function deleteLeadsAction(ids: string[]) {
  ids = z.array(z.string().uuid()).max(2000).parse(ids);
  const ctx = await requireOrg();
  const db = await getDb();
  await deleteAuditedLeads(db, ctx.user, ctx.org, ids, !canManage(ctx.role) && ctx.user.platformRole !== 'admin');
  await flushDeletionReports(db);
  revalidatePath('/leads');
}

export type SimLead = { linkedinUrl: string; fullName: string; headline: string; company: string; location: string };

export async function aiSearchAction(prompt: string): Promise<{ plan?: SearchPlan; error?: string; remaining?: number; results?: SimLead[] }> {
  const ctx = await requireOrg();
  if (!ctx.org.aiEnabled) return { error: 'A IA está desligada nesta operação. O administrador pode ativá-la em Administração de parceiros.' };
  const text = prompt.trim().slice(0, 400);
  if (text.length < 4) return { error: 'Descreva quem você procura.' };
  if (ctx.org.isDemo) {
    // demonstração: simula a busca que traz leads reais (nenhuma consulta externa)
    return { results: searchDemoLeads(text), remaining: 287 };
  }
  const db = await getDb();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [{ used }] = await db.select({ used: count() }).from(schema.events)
    .where(and(eq(schema.events.orgId, ctx.org.id), eq(schema.events.type, 'ai_search'), gte(schema.events.at, monthStart)));
  const remaining = ctx.org.searchCreditsMonth - used;
  if (remaining <= 0) return { error: 'Créditos de busca do mês esgotados. Fale com o administrador.' };
  const plan = await planSearch(text);
  await db.insert(schema.events).values({ orgId: ctx.org.id, userId: ctx.user.id, type: 'ai_search' });
  return { plan, remaining: remaining - 1 };
}

// ---------- Campanhas ----------

const stepSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(['react', 'comment', 'invite', 'message']),
  delayDays: z.coerce.number().int().min(0).max(60),
  condition: z.enum(['always', 'accepted']),
  template: z.string().max(1500),
  useAi: z.boolean(),
});
const campaignSchema = z.object({
  name: z.string().trim().min(2, 'Dê um nome à campanha.').max(80),
  aiBrief: z.string().max(1200),
  assignedTo: z.string().uuid().nullable(),
  steps: z.array(stepSchema).min(1, 'Adicione pelo menos um passo.').max(12),
});

export async function saveCampaignAction(id: string | null, input: unknown): Promise<{ error?: string; id?: string }> {
  const ctx = await requireOrg();
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const data = parsed.data;
  if (data.steps.some((s) => s.type !== 'react' && !s.template.trim() && !s.useAi)) return { error: 'Preencha o texto de cada passo ou ligue a IA.' };
  const db = await getDb();
  if (data.assignedTo) {
    const [m] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, data.assignedTo)));
    if (!m) return { error: 'Responsável inválido.' };
  }
  const values = { name: data.name, aiBrief: data.aiBrief, assignedTo: data.assignedTo, steps: data.steps as CampaignStep[] };
  if (id) {
    await db.update(schema.campaigns).set(values).where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, ctx.org.id)));
    revalidatePath(`/campanhas/${id}`); revalidatePath('/campanhas');
    return { id };
  }
  const [c] = await db.insert(schema.campaigns).values({ ...values, orgId: ctx.org.id, ownerId: ctx.user.id }).returning({ id: schema.campaigns.id });
  revalidatePath('/campanhas');
  return { id: c.id };
}

export async function setCampaignStatusAction(id: string, status: 'active' | 'paused' | 'finished') {
  const ctx = await requireOrg();
  const db = await getDb();
  await db.update(schema.campaigns).set({ status }).where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, ctx.org.id)));
  if (status === 'active') await runScheduler(db, { orgId: ctx.org.id, generate: aiGenerator });
  revalidatePath(`/campanhas/${id}`); revalidatePath('/campanhas'); revalidatePath('/fila');
}

export async function enrollAction(campaignId: string, filter: { tag?: string; leadIds?: string[] }): Promise<{ ok?: string; error?: string }> {
  const ctx = await requireOrg();
  const db = await getDb();
  let ids = filter.leadIds ?? [];
  if (!ids.length) {
    const conds = [eq(schema.leads.orgId, ctx.org.id), eq(schema.leads.stage, 'new')];
    if (filter.tag) conds.push(eq(schema.leads.tag, filter.tag));
    ids = (await db.select({ id: schema.leads.id }).from(schema.leads).where(and(...conds)).limit(2000)).map((r) => r.id);
  }
  const r = await enrollLeads(db, ctx.org.id, campaignId, ids);
  await runScheduler(db, { orgId: ctx.org.id, generate: aiGenerator });
  revalidatePath(`/campanhas/${campaignId}`); revalidatePath('/fila');
  if (!ids.length) return { error: 'Nenhum lead novo encontrado para esse filtro.' };
  return { ok: `${r.added} lead(s) inscrito(s).${r.skipped ? ` ${r.skipped} já estavam em outra cadência ou encerrados.` : ''}` };
}

// ---------- Fila do dia ----------

export async function completeActionAction(actionId: string, outcome: 'done' | 'skipped', body?: string) {
  const ctx = await requireOrg();
  const db = await getDb();
  await completeAction(db, ctx.org.id, ctx.user.id, actionId, outcome, body);
  revalidatePath('/fila'); revalidatePath('/painel');
}

export async function refreshQueueAction() {
  const ctx = await requireOrg();
  const db = await getDb();
  await runScheduler(db, { orgId: ctx.org.id, generate: aiGenerator });
  revalidatePath('/fila');
}

export async function confirmMeetingAction(meetingId: string, whenIso: string): Promise<State> {
  const ctx = await requireOrg();
  const when = new Date(whenIso);
  if (Number.isNaN(when.getTime())) return { error: 'Data da reunião inválida.' };
  const result = await confirmMeetingAndInvite(await getDb(), { orgId: ctx.org.id, userId: ctx.user.id }, meetingId, when, ctx.user.email);
  revalidatePath('/fila'); revalidatePath('/painel');
  if (result.inviteState === 'missing_email') return { ok: 'Reunião confirmada. Cadastre o e-mail do lead para enviar o convite manualmente.' };
  if (result.inviteState === 'unknown') return { ok: 'Reunião confirmada. O envio do convite ficou incerto; confira no Office 365 antes de enviar manualmente.' };
  return { ok: result.inviteState === 'sent' ? 'Reunião confirmada e convite enviado.' : 'Reunião já confirmada.' };
}

export async function cancelMeetingAction(meetingId: string) {
  const ctx = await requireOrg();
  await cancelMeeting(await getDb(), { orgId: ctx.org.id, userId: ctx.user.id }, meetingId);
  revalidatePath('/fila');
}

// ---------- Equipe ----------

export async function inviteMemberAction(_: State, form: FormData): Promise<State> {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) return { error: 'Só donos e gestores convidam pessoas.' };
  if (ctx.org.isDemo) return { ok: 'Demonstração: convite simulado, nenhum e-mail foi enviado.' };
  const email = normalizeEmail(String(form.get('email') ?? ''));
  const name = String(form.get('name') ?? '').trim();
  const role = z.enum(['owner', 'manager', 'sdr', 'closer']).catch('sdr').parse(form.get('role'));
  if (!email.includes('@')) return { error: 'E-mail inválido.' };
  if (role === 'owner' && ctx.role !== 'owner') return { error: 'Só o dono pode convidar outro dono.' };
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.memberships).where(eq(schema.memberships.orgId, ctx.org.id));
  if (n >= ctx.org.seats) return { error: `Limite de ${ctx.org.seats} usuários deste parceiro atingido.` };
  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) [user] = await db.insert(schema.users).values({ email, name, status: 'invited' }).returning();
  await db.insert(schema.memberships).values({ orgId: ctx.org.id, userId: user.id, role }).onConflictDoNothing();
  if (user.status !== 'active') {
    try {
      await sendAccessEmail(email, await issueAccessLink(user.id, 'invite'), { kind: 'invite', name, orgName: ctx.org.name });
    } catch (e) {
      console.error('invite email failed', e);
      revalidatePath('/equipe');
      return { error: 'Pessoa adicionada, mas o e-mail não saiu. Use "Reenviar convite" em instantes.' };
    }
  }
  revalidatePath('/equipe');
  return { ok: user.status === 'active' ? `${email} já tinha conta e foi adicionado à equipe.` : `Convite enviado para ${email}.` };
}

export async function resendInviteAction(userId: string): Promise<{ ok?: string; error?: string }> {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) return { error: 'Sem permissão.' };
  if (ctx.org.isDemo) return { ok: 'Demonstração: nenhum e-mail foi enviado.' };
  const db = await getDb();
  const [row] = await db.select({ user: schema.users }).from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, userId)));
  if (!row) return { error: 'Usuário não encontrado.' };
  try {
    await sendAccessEmail(row.user.email, await issueAccessLink(userId, row.user.status === 'active' ? 'reset' : 'invite'), { kind: row.user.status === 'active' ? 'reset' : 'invite', name: row.user.name, orgName: ctx.org.name });
    return { ok: `E-mail enviado para ${row.user.email}.` };
  } catch {
    return { error: 'O Office 365 recusou o envio. Confira a configuração.' };
  }
}

export async function setMemberRoleAction(userId: string, role: 'owner' | 'manager' | 'sdr' | 'closer') {
  const ctx = await requireOrg();
  if (!canManage(ctx.role) || (role === 'owner' && ctx.role !== 'owner')) return;
  const db = await getDb();
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!target || !canChangeUser({ ...ctx.user, platformRole: 'admin' }, target)) return;
  await db.update(schema.memberships).set({ role }).where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, userId)));
  revalidatePath('/equipe');
}

export async function removeMemberAction(userId: string) {
  const ctx = await requireOrg();
  if (!canManage(ctx.role) || userId === ctx.user.id) return;
  const db = await getDb();
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!target || !canChangeUser({ ...ctx.user, platformRole: 'admin' }, target)) return;
  await db.delete(schema.memberships).where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, userId)));
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId), eq(schema.sessions.orgId, ctx.org.id)));
  const [remaining] = await db.select({ id: schema.memberships.orgId }).from(schema.memberships).innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId)).where(and(eq(schema.memberships.userId, userId), eq(schema.orgs.isDemo, false))).limit(1);
  if (!remaining) { await db.update(schema.users).set({status:'disabled'}).where(eq(schema.users.id,userId)); await db.delete(schema.sessions).where(eq(schema.sessions.userId,userId)); await db.update(schema.authTokens).set({usedAt:new Date()}).where(eq(schema.authTokens.userId,userId)); }
  revalidatePath('/equipe');
}

// ---------- Conta ----------

export async function updateAccountAction(_: State, form: FormData): Promise<State> {
  const ctx = await requireUser();
  const linkedin = String(form.get('linkedinUrl') ?? '').trim();
  const url = linkedin ? normalizeLinkedinUrl(linkedin) : null;
  if (linkedin && !url) return { error: 'URL do LinkedIn inválida.' };
  const db = await getDb();
  await db.update(schema.users).set({
    name: String(form.get('name') ?? '').trim().slice(0, 80),
    linkedinUrl: url,
    dailyInvites: Math.min(40, Math.max(1, Number(form.get('dailyInvites')) || 15)),
    dailyMessages: Math.min(100, Math.max(1, Number(form.get('dailyMessages')) || 40)),
  }).where(eq(schema.users.id, ctx.user.id));
  revalidatePath('/conta');
  return { ok: 'Dados salvos.' };
}

// ---------- Admin master ----------

export async function createPartnerAction(_: State, form: FormData): Promise<State> {
  await requireAdmin();
  const name = String(form.get('name') ?? '').trim();
  const ownerEmail = normalizeEmail(String(form.get('ownerEmail') ?? ''));
  const ownerName = String(form.get('ownerName') ?? '').trim();
  const seats = Math.min(200, Math.max(1, Number(form.get('seats')) || 5));
  const credits = Math.min(100000, Math.max(0, Number(form.get('credits')) || 300));
  if (name.length < 2) return { error: 'Informe o nome do parceiro.' };
  if (!ownerEmail.includes('@')) return { error: 'Informe o e-mail do responsável.' };
  const db = await getDb();
  const [org] = await db.insert(schema.orgs).values({ name, seats, searchCreditsMonth: credits }).returning();
  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, ownerEmail));
  if (!user) [user] = await db.insert(schema.users).values({ email: ownerEmail, name: ownerName, status: 'invited' }).returning();
  await db.insert(schema.memberships).values({ orgId: org.id, userId: user.id, role: 'owner' }).onConflictDoNothing();
  revalidatePath('/admin');
  if (user.status !== 'active') {
    try {
      await sendAccessEmail(ownerEmail, await issueAccessLink(user.id, 'invite'), { kind: 'invite', name: ownerName, orgName: name });
    } catch (e) {
      console.error(e);
      return { error: `Parceiro criado, mas o convite não saiu pelo Office 365. Reenvie pela tela de Equipe.` };
    }
  }
  return { ok: `Parceiro ${name} criado e convite enviado para ${ownerEmail}.` };
}

export async function updatePartnerAction(orgId: string, patch: { seats?: number; searchCreditsMonth?: number; active?: boolean; aiEnabled?: boolean }) {
  await requireAdmin();
  const db = await getDb();
  const validated = z.object({ seats: z.number().int().min(1).max(200).optional(), searchCreditsMonth: z.number().int().min(0).max(100000).optional(), active: z.boolean().optional(), aiEnabled: z.boolean().optional() }).strict().parse(patch);
  await db.update(schema.orgs).set(validated).where(eq(schema.orgs.id, orgId));
  revalidatePath('/admin');
}

export async function setUserStatusAction(userId: string, status: 'active' | 'disabled') {
  const ctx = await requireAdmin();
  if (userId === ctx.user.id) return;
  const db = await getDb();
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!target || !canChangeUser(ctx.user, target)) return;
  await db.update(schema.users).set({ status }).where(and(eq(schema.users.id, userId), sql`${schema.users.passwordHash} is not null`));
  if (status === 'disabled') await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  revalidatePath('/admin');
}

// ---------- Demonstração: piloto automático simulado ----------

export async function addSearchResultsAction(urls: string[], tag: string): Promise<{ ok?: string; error?: string }> {
  const ctx = await requireOrg();
  if (!ctx.org.isDemo) return { error: 'Disponível apenas na demonstração.' };
  const db = await getDb();
  const n = await addSearchResults(db, ctx.org.id, ctx.user.id, urls, tag.slice(0, 40) || 'Busca com IA');
  revalidatePath('/leads');
  return { ok: n ? `${n} lead(s) adicionados à sua base.` : 'Esses leads já estavam na base.' };
}

export async function simulateCycleAction() {
  const ctx = await requireOrg();
  if (!ctx.org.isDemo) return;
  const db = await getDb();
  await seedFeedIfEmpty(ctx.org.id);
  await simulateCycle(db, ctx.org.id);
  revalidatePath('/automacao'); revalidatePath('/painel'); revalidatePath('/leads'); revalidatePath('/fila');
}

async function seedFeedIfEmpty(orgId: string) {
  const db = await getDb();
  const [row] = await db.select({ id: schema.simFeed.id }).from(schema.simFeed).where(eq(schema.simFeed.orgId, orgId)).limit(1);
  if (!row) await seedFeed(db, orgId);
}

// ---------- Suporte ----------

export async function replySupportAction(conversationId: string, body: string): Promise<State> {
  const ctx = await requireOrg();
  if (!body?.trim()) return { error: 'Escreva uma resposta.' };
  const db = await getDb();
  try {
    await replyToConversation(db, { orgId: ctx.org.id, userId: ctx.user.id, role: ctx.role }, conversationId, body);
  } catch (e) { return { error: e instanceof Error ? e.message : 'Não foi possível responder.' }; }
  // Conversa de WhatsApp: entrega a resposta pelo gateway quando configurado (best-effort; já ficou registrada).
  try {
    const [c] = await db.select().from(schema.supportConversations).where(and(eq(schema.supportConversations.id, conversationId), eq(schema.supportConversations.orgId, ctx.org.id)));
    const cfg = akgConfig();
    if (c?.channel === 'whatsapp' && c.visitorPhone && cfg) await new AkgGateway(cfg).sendText({ orgId: ctx.org.id, userId: ctx.user.id }, c.visitorPhone, body);
  } catch { /* entrega pelo WhatsApp é best-effort */ }
  revalidatePath('/suporte');
  return { ok: 'Resposta enviada.' };
}

export async function setSupportStatusAction(conversationId: string, status: 'open' | 'closed') {
  const ctx = await requireOrg();
  await setConversationStatus(await getDb(), { orgId: ctx.org.id, userId: ctx.user.id, role: ctx.role }, conversationId, status);
  revalidatePath('/suporte');
}

export async function setSupportLabelsAction(conversationId: string, labels: string[]): Promise<State> {
  const ctx = await requireOrg();
  try {
    await setConversationLabels(await getDb(), { orgId: ctx.org.id, userId: ctx.user.id, role: ctx.role }, conversationId, labels);
  } catch (e) { return { error: e instanceof Error ? e.message : 'Não foi possível salvar as etiquetas.' }; }
  revalidatePath('/suporte');
  return { ok: 'Etiquetas atualizadas.' };
}

export async function assignSupportAction(conversationId: string, assigneeId: string | null): Promise<State> {
  const ctx = await requireOrg();
  try {
    await assignConversation(await getDb(), { orgId: ctx.org.id, userId: ctx.user.id, role: ctx.role }, conversationId, assigneeId);
  } catch (e) { return { error: e instanceof Error ? e.message : 'Não foi possível atribuir a conversa.' }; }
  revalidatePath('/suporte');
  return { ok: 'Responsável atualizado.' };
}

// ---------- Central de ajuda ----------

export async function saveArticleAction(_: State, form: FormData): Promise<State> {
  const ctx = await requireOrg();
  const id = String(form.get('id') ?? '').trim() || undefined;
  const title = String(form.get('title') ?? '').trim();
  const body = String(form.get('body') ?? '');
  if (!title) return { error: 'Dê um título ao artigo.' };
  try { await upsertArticle(await getDb(), ctx.org.id, { id, title, body }); }
  catch (e) { return { error: e instanceof Error ? e.message : 'Não foi possível salvar.' }; }
  revalidatePath('/ajuda');
  return { ok: 'Artigo salvo.' };
}

export async function setArticleStatusAction(id: string, status: 'draft' | 'published') {
  const ctx = await requireOrg();
  await setArticleStatus(await getDb(), ctx.org.id, id, status);
  revalidatePath('/ajuda');
}

// ---------- Suporte interno → Argus ----------

export async function openSupportTicketAction(_: State, form: FormData): Promise<State> {
  const ctx = await requireOrg();
  const subject = String(form.get('subject') ?? '').trim();
  const body = String(form.get('body') ?? '').trim();
  if (!subject || !body) return { error: 'Preencha assunto e mensagem.' };
  try { await openInternalTicket(await getDb(), { orgId: ctx.org.id, userId: ctx.user.id, email: ctx.user.email, name: ctx.user.name }, { subject, body }); }
  catch (e) { return { error: e instanceof Error ? e.message : 'Não foi possível abrir o chamado.' }; }
  // Roteia para o Argus por e-mail (best-effort; o chamado já ficou registrado).
  sendSupportMail(ARGUS_SUPPORT, `Chamado do Prospectra+: ${subject}`, `${ctx.user.name} (${ctx.user.email}) — equipe ${ctx.org.name}\n\n${body}`).catch(() => {});
  revalidatePath('/suporte');
  return { ok: 'Chamado aberto. O suporte da Argus responde por aqui e por e-mail.' };
}

export async function argusReplyAction(conversationId: string, body: string): Promise<State> {
  const ctx = await requireAdmin();
  if (!body?.trim()) return { error: 'Escreva uma resposta.' };
  let to = '';
  try { ({ to } = await adminReplyProduct(await getDb(), ctx.user.id, conversationId, body)); }
  catch (e) { return { error: e instanceof Error ? e.message : 'Não foi possível responder.' }; }
  if (to) sendSupportMail([to], 'Resposta do suporte Argus', body).catch(() => {});
  revalidatePath('/argus');
  return { ok: 'Resposta enviada.' };
}

export async function argusStatusAction(conversationId: string, status: 'open' | 'closed') {
  await requireAdmin();
  await adminSetProductStatus(await getDb(), conversationId, status);
  revalidatePath('/argus');
}

// ---------- Workspace: Docs ----------

export async function saveDocAction(_: State, form: FormData): Promise<State> {
  const ctx = await requireOrg();
  const id = String(form.get('id') ?? '').trim() || undefined;
  const title = String(form.get('title') ?? '').trim();
  const body = String(form.get('body') ?? '');
  if (!title) return { error: 'Dê um título ao documento.' };
  try { await upsertDoc(await getDb(), ctx.org.id, ctx.user.id, { id, title, body }); }
  catch (e) { return { error: e instanceof Error ? e.message : 'Não foi possível salvar.' }; }
  revalidatePath('/docs');
  return { ok: 'Documento salvo.' };
}

export async function deleteDocAction(id: string) {
  const ctx = await requireOrg();
  await deleteDoc(await getDb(), ctx.org.id, id);
  revalidatePath('/docs');
}

// ---------- Workspace: Projetos ----------

export async function createTaskAction(_: State, form: FormData): Promise<State> {
  const ctx = await requireOrg();
  const title = String(form.get('title') ?? '').trim();
  if (!title) return { error: 'Descreva a tarefa.' };
  const assignedTo = String(form.get('assignedTo') ?? '').trim() || null;
  await createTask(await getDb(), ctx.org.id, { title, assignedTo });
  revalidatePath('/projetos');
  return { ok: 'Tarefa criada.' };
}

export async function setTaskStatusAction(id: string, status: TaskStatus) {
  const ctx = await requireOrg();
  await setTaskStatus(await getDb(), ctx.org.id, id, status);
  revalidatePath('/projetos');
}

export async function assignTaskAction(id: string, userId: string | null) {
  const ctx = await requireOrg();
  await assignTask(await getDb(), ctx.org.id, id, userId || null);
  revalidatePath('/projetos');
}

export async function deleteTaskAction(id: string) {
  const ctx = await requireOrg();
  await deleteTask(await getDb(), ctx.org.id, id);
  revalidatePath('/projetos');
}

export async function deleteArticleAction(id: string) {
  const ctx = await requireOrg();
  await deleteArticle(await getDb(), ctx.org.id, id);
  revalidatePath('/ajuda');
}

