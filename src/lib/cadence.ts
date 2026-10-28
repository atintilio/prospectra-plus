import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import type { DB } from '@/db';
import * as schema from '@/db/schema';
import type { CampaignStep, EventType, LeadStage } from '@/db/schema';
import { fillTemplate } from './template';
import { sendWhatsAppCommand } from '@/lib/whatsapp/commands';
import { AkgGateway, akgConfig } from '@/lib/whatsapp/akg';
import { sendSupportMail, mailerConfigured } from '@/lib/mailer';
import { queueVoiceDelivery } from '@/lib/voice/delivery';

// Motor da cadência (modo assistido).
// - O scheduler transforma inscrições vencidas em "ações" na Fila do dia de quem executa a campanha.
// - O usuário marca a ação como feita / pulada; marca resultados do lead (aceitou, respondeu, reunião, venda).
// - Resposta encerra a cadência do lead. Passos com condição "accepted" esperam o aceite do convite.

export type Generator = (args: { step: CampaignStep; lead: typeof schema.leads.$inferSelect; brief: string }) => Promise<string>;

export const defaultGenerator: Generator = async ({ step, lead }) => fillTemplate(step.template, lead);

export function dayString(d: Date, tz = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400_000);
}

const STAGE_ORDER: LeadStage[] = ['new', 'invited', 'connected', 'replied', 'meeting', 'won'];

function advanceStage(current: LeadStage, target: LeadStage): LeadStage {
  if (current === 'lost' || current === 'do_not_contact') return current;
  if (target === 'lost' || target === 'do_not_contact') return target;
  return STAGE_ORDER.indexOf(target) > STAGE_ORDER.indexOf(current) ? target : current;
}

async function logEvent(db: DB, e: { orgId: string; userId?: string | null; campaignId?: string | null; leadId?: string | null; type: EventType; at?: Date }) {
  await db.insert(schema.events).values({ ...e, at: e.at ?? new Date() });
}

/** Inscreve leads numa campanha. Ignora quem já está numa cadência ativa no mesmo parceiro. */
export async function enrollLeads(db: DB, orgId: string, campaignId: string, leadIds: string[], now = new Date()) {
  if (!leadIds.length) return { added: 0, skipped: 0 };
  const [camp] = await db.select({ id: schema.campaigns.id }).from(schema.campaigns)
    .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.orgId, orgId)));
  if (!camp) return { added: 0, skipped: leadIds.length };
  const eligible = await db.select({ id: schema.leads.id }).from(schema.leads)
    .where(and(eq(schema.leads.orgId, orgId), inArray(schema.leads.id, leadIds), sql`${schema.leads.stage} not in ('do_not_contact','lost','won')`));
  let added = 0;
  for (const { id } of eligible) {
    const res = await db.insert(schema.enrollments)
      .values({ orgId, campaignId, leadId: id, nextRunAt: now })
      .onConflictDoNothing()
      .returning({ id: schema.enrollments.id });
    added += res.length;
  }
  return { added, skipped: leadIds.length - added };
}

/** Gera as ações vencidas. Idempotente: rodar duas vezes não duplica ações. */
export async function runScheduler(db: DB, opts: {
  orgId?: string; now?: Date; generate?: Generator;
  sendEmail?: (to: string, subject: string, body: string) => Promise<void>;
  sendWhatsapp?: (scope: { orgId: string; userId: string }, phone: string, text: string) => Promise<{ providerMessageId: string }>;
  sendMedia?: (scope: { orgId: string; userId: string }, phone: string, file: Blob, caption: string, kind: 'image' | 'document') => Promise<{ providerMessageId: string }>;
} = {}) {
  const now = opts.now ?? new Date();
  const generate = opts.generate ?? defaultGenerator;
  const conds = [eq(schema.enrollments.state, 'running'), lte(schema.enrollments.nextRunAt, now), eq(schema.campaigns.status, 'active')];
  if (opts.orgId) conds.push(eq(schema.enrollments.orgId, opts.orgId));
  const due = await db
    .select({ enr: schema.enrollments, camp: schema.campaigns, lead: schema.leads, aiEnabled: schema.orgs.aiEnabled })
    .from(schema.enrollments)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.enrollments.orgId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.enrollments.campaignId))
    .innerJoin(schema.leads, eq(schema.leads.id, schema.enrollments.leadId))
    .where(and(...conds))
    .limit(500);

  let created = 0;
  for (const { enr, camp, lead, aiEnabled } of due) {
    const step = camp.steps[enr.stepIndex];
    if (!step) {
      await db.update(schema.enrollments).set({ state: 'done' }).where(eq(schema.enrollments.id, enr.id));
      continue;
    }
    if (lead.stage === 'replied' || lead.stage === 'meeting' || lead.stage === 'won' || lead.stage === 'lost' || lead.stage === 'do_not_contact') {
      await db.update(schema.enrollments).set({ state: 'stopped' }).where(eq(schema.enrollments.id, enr.id));
      continue;
    }
    if (step.condition === 'accepted' && lead.stage !== 'connected') {
      await db.update(schema.enrollments).set({ state: 'waiting_accept' }).where(eq(schema.enrollments.id, enr.id));
      continue;
    }
    const userId = camp.assignedTo ?? camp.ownerId;
    let body = '';
    if (step.type !== 'react') {
      body = step.useAi && aiEnabled ? await generate({ step, lead, brief: camp.aiBrief }).catch(() => fillTemplate(step.template, lead)) : fillTemplate(step.template, lead);
      if (step.type === 'invite') body = body.slice(0, 300); // limite da nota de convite do LinkedIn
    }
    const [action] = await db.insert(schema.actions).values({
      orgId: enr.orgId, enrollmentId: enr.id, campaignId: camp.id, leadId: lead.id,
      userId, stepIndex: enr.stepIndex, type: step.type, body, dueDate: dayString(now),
    }).onConflictDoNothing().returning({ id: schema.actions.id });
    if (action) created++;

    // Canais automáticos. Se enviar, conclui a ação e a cadência avança; senão fica pendente (fallback
    // assistido na Fila), sem reenvio automático. Delays/limites vêm do passo e do usuário, não inventados.
    if (action && step.type === 'email') {
      const to = (lead.email ?? '').trim();
      const send = opts.sendEmail ?? (mailerConfigured() ? (t: string, s: string, b: string) => sendSupportMail([t], s, b) : null);
      if (to && send) {
        const subject = (step.subject && fillTemplate(step.subject, lead).trim()) || `Contato — ${lead.company || lead.fullName}`;
        try { await send(to, subject, body); await completeAction(db, enr.orgId, userId, action.id, 'done', body, now); continue; }
        catch { /* incerto: fica pendente, sem reenvio automático */ }
      }
    } else if (action && step.type === 'whatsapp') {
      const phone = (lead.phone ?? '').replace(/\D/g, '');
      const cfg = akgConfig();
      const send = opts.sendWhatsapp ?? (cfg ? (scope: { orgId: string; userId: string }, p: string, t: string) => new AkgGateway(cfg).sendText(scope, p, t) : null);
      if (phone && send) {
        const [u] = await db.select({ d: schema.users.dailyMessages }).from(schema.users).where(eq(schema.users.id, userId));
        try {
          const r = await sendWhatsAppCommand(db, { orgId: enr.orgId, userId }, { id: action.id, recipient: phone, text: body }, u?.d ?? 40, send);
          if (r.state === 'sent') { await completeAction(db, enr.orgId, userId, action.id, 'done', body, now); continue; }
        } catch { /* incerto: pendente, sem reenvio */ }
      }
    } else if (action && step.type === 'voice') {
      const phone = (lead.phone ?? '').replace(/\D/g, '');
      if (phone) {
        // Só enfileira a mensagem de voz (idempotente por action.id). A geração no Voice Studio pode
        // levar minutos, então roda no worker de voz, que conclui a ação ao enviar. Aqui nunca geramos
        // áudio nem concluímos; sem voz disponível, fica assistida na Fila.
        try { await queueVoiceDelivery(db, { orgId: enr.orgId, userId }, { id: action.id, recipient: phone, text: body, kind: 'audio' }); }
        catch { /* voz indisponível nesta operação */ }
      }
    } else if (action && step.type === 'image') {
      const phone = (lead.phone ?? '').replace(/\D/g, '');
      const url = (step.mediaUrl ?? '').trim();
      const cfg = akgConfig();
      const send = opts.sendMedia ?? (cfg ? (scope: { orgId: string; userId: string }, p: string, f: Blob, c: string, k: 'image' | 'document') => new AkgGateway(cfg).sendMedia(scope, p, f, c, k) : null);
      if (phone && url && send) {
        try {
          const media = await fetchMedia(url); // https, tamanho limitado; body é a legenda
          await send({ orgId: enr.orgId, userId }, phone, media.file, body, media.kind);
          await completeAction(db, enr.orgId, userId, action.id, 'done', body, now); continue;
        } catch { /* incerto/sem mídia: fica pendente, sem reenvio automático */ }
      }
    }
    // aguardando execução (assistida ou canal não configurado): próximo passo só após concluir a ação
    await db.update(schema.enrollments).set({ nextRunAt: addDays(now, 3650) }).where(eq(schema.enrollments.id, enr.id));
  }
  return { processed: due.length, created };
}

const ACTION_EVENT: Record<string, EventType> = { invite: 'invite_sent', message: 'message_sent', react: 'reaction_sent', comment: 'comment_sent', email: 'email_sent', whatsapp: 'whatsapp_sent', voice: 'voice_sent', image: 'image_sent' };

// Busca a imagem/informativo da URL pública do passo. https apenas; tamanho limitado; tipo pela resposta.
// shortcut: aceita URL pública (sem upload/armazenamento próprio); evoluir para upload quando necessário.
async function fetchMedia(url: string): Promise<{ file: Blob; kind: 'image' | 'document' }> {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('A URL da mídia precisa ser https.');
  const res = await fetch(u, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error('Mídia indisponível na URL.');
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  const kind = type === 'application/pdf' ? 'document' : type.startsWith('image/') ? 'image' : null;
  if (!kind) throw new Error('Tipo de mídia não suportado (use imagem ou PDF).');
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 16_000_000) throw new Error('Mídia acima de 16 MB.');
  return { file: new Blob([buf], { type }), kind };
}

/** Conclui (ou pula) uma ação da fila e agenda o próximo passo da cadência. */
export async function completeAction(db: DB, orgId: string, userId: string, actionId: string, outcome: 'done' | 'skipped', body?: string, now = new Date()) {
  const [row] = await db.select({ action: schema.actions, enr: schema.enrollments, camp: schema.campaigns, lead: schema.leads })
    .from(schema.actions)
    .innerJoin(schema.enrollments, eq(schema.enrollments.id, schema.actions.enrollmentId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.actions.campaignId))
    .innerJoin(schema.leads, eq(schema.leads.id, schema.actions.leadId))
    .where(and(eq(schema.actions.id, actionId), eq(schema.actions.orgId, orgId)));
  if (!row) throw new Error('Ação não encontrada');
  if (row.action.status !== 'pending') return row.action;

  await db.update(schema.actions).set({ status: outcome, executedAt: now, ...(body !== undefined ? { body } : {}) }).where(eq(schema.actions.id, actionId));
  if (outcome === 'done') {
    await logEvent(db, { orgId, userId, campaignId: row.camp.id, leadId: row.lead.id, type: ACTION_EVENT[row.action.type], at: now });
    const stage = row.action.type === 'invite' ? advanceStage(row.lead.stage, 'invited') : row.lead.stage;
    await db.update(schema.leads).set({ stage, lastActivityAt: now }).where(eq(schema.leads.id, row.lead.id));
  }
  const nextIndex = row.enr.stepIndex + 1;
  const next = row.camp.steps[nextIndex];
  if (!next) {
    await db.update(schema.enrollments).set({ stepIndex: nextIndex, state: 'done' }).where(eq(schema.enrollments.id, row.enr.id));
  } else {
    await db.update(schema.enrollments).set({ stepIndex: nextIndex, state: 'running', nextRunAt: addDays(now, next.delayDays) })
      .where(eq(schema.enrollments.id, row.enr.id));
  }
  return row.action;
}

export type Outcome = 'accepted' | 'replied' | 'meeting' | 'won' | 'lost' | 'do_not_contact';
const OUTCOME_STAGE: Record<Outcome, LeadStage> = { accepted: 'connected', replied: 'replied', meeting: 'meeting', won: 'won', lost: 'lost', do_not_contact: 'do_not_contact' };
const OUTCOME_EVENT: Partial<Record<Outcome, EventType>> = { accepted: 'invite_accepted', replied: 'reply_received', meeting: 'meeting_booked', won: 'deal_won', lost: 'deal_lost' };

/** Registra um resultado do lead. Aceite libera passos "após aceite"; resposta encerra a cadência. */
export async function markOutcome(db: DB, orgId: string, userId: string, leadId: string, outcome: Outcome, now = new Date()) {
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, orgId)));
  if (!lead) throw new Error('Lead não encontrado');
  const stage = advanceStage(lead.stage, OUTCOME_STAGE[outcome]);
  await db.update(schema.leads).set({ stage, lastActivityAt: now }).where(eq(schema.leads.id, leadId));
  const ev = OUTCOME_EVENT[outcome];
  const [enr] = await db.select().from(schema.enrollments)
    .where(and(eq(schema.enrollments.leadId, leadId), eq(schema.enrollments.orgId, orgId), inArray(schema.enrollments.state, ['running', 'waiting_accept'])));
  if (ev) await logEvent(db, { orgId, userId, leadId, campaignId: enr?.campaignId ?? null, type: ev, at: now });
  if (!enr) return { stage };
  if (outcome === 'accepted') {
    if (enr.state === 'waiting_accept') {
      await db.update(schema.enrollments).set({ state: 'running', nextRunAt: now }).where(eq(schema.enrollments.id, enr.id));
    }
  } else {
    await db.update(schema.enrollments).set({ state: 'stopped' }).where(eq(schema.enrollments.id, enr.id));
    await db.update(schema.actions).set({ status: 'skipped' })
      .where(and(eq(schema.actions.enrollmentId, enr.id), eq(schema.actions.status, 'pending')));
  }
  return { stage };
}

