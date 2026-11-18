'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { commercialInputSchema, generateCommercial, type CommercialResult } from '@/lib/harvey';
import { mailerConfigured, sendRawEmail } from '@/lib/mailer';

function esc(v: string): string { return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] ?? c)); }

/** Notifica por e-mail (Office 365) o responsável definido pelo roteamento do handoff. Best-effort. */
async function notifyHandoff(handoff: NonNullable<CommercialResult['handoff']>, leadName: string, offer: string, senderEmail?: string | null): Promise<void> {
  if (!mailerConfigured()) return;
  const appUrl = (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  const html = `<p>O assistente comercial encaminhou um lead para você revisar.</p>
    <p><strong>Lead:</strong> ${esc(leadName)}<br><strong>Oferta:</strong> ${esc(offer)}<br><strong>Motivo:</strong> ${esc(handoff.reason)}</p>
    <p>${esc(handoff.summary)}</p>
    <p><strong>Próximo passo:</strong> ${esc(handoff.nextStep)}</p>
    ${appUrl ? `<p><a href="${appUrl}/leads">Abrir no Prospectra</a></p>` : ''}
    <p style="color:#5c5f66;font-size:12px">Encaminhamento automático; nenhuma mensagem foi enviada ao lead.</p>`;
  for (const to of handoff.recipients) {
    try { await sendRawEmail({ to, subject: `Prospectra · encaminhamento: ${leadName} (${handoff.reason})`, html, mailbox: senderEmail ?? undefined }); }
    catch (e) { console.error('handoff notify failed', to, e instanceof Error ? e.message : e); }
  }
}

const requestSchema = commercialInputSchema.omit({ lead: true }).extend({ leadId: z.string().uuid(), approved: z.literal(true) }).strict();
export type IntelligenceState = { result?: CommercialResult; error?: string; saved?: boolean };
export async function generateCommercialAction(raw: unknown): Promise<IntelligenceState> {
  const ctx = await requireOrg();
  if (!ctx.org.active || ctx.user.status !== 'active') return { error: 'Esta conta ou operação está inativa.' };
  if (!ctx.org.aiEnabled) return { error: 'A IA está desligada nesta operação.' };
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return { error: 'Revise o vendedor, a estratégia, as ofertas e a aprovação do contexto.' };
  const db = await getDb();
  const where = and(eq(schema.leads.id, parsed.data.leadId), eq(schema.leads.orgId, ctx.org.id), eq(schema.leads.ownerId, ctx.user.id));
  const [lead] = await db.select().from(schema.leads).where(where).limit(1);
  if (!lead) return { error: 'Selecione um lead da sua carteira nesta operação.' };
  if (lead.stage === 'do_not_contact') return { error: 'Este lead está marcado para não receber contatos.' };
  try {
    const result = await generateCommercial({ userId: ctx.user.id, status: ctx.user.status, orgId: ctx.org.id, orgActive: ctx.org.active, aiEnabled: ctx.org.aiEnabled }, {
      sellerName: parsed.data.sellerName, strategy: parsed.data.strategy, offers: parsed.data.offers, inbound: parsed.data.inbound,
      lead: { id: lead.id, orgId: lead.orgId, ownerId: lead.ownerId, fullName: lead.fullName, company: lead.company, headline: lead.headline, stage: lead.stage },
    });
    // A legitimate lead note, never a sent-message event or executable queue item.
    // Atomic concatenation preserves notes written concurrently. No inbound transcript stored.
    const note = `\n\n[Assistente comercial · ${new Date().toISOString()} · revisão pendente]\n${JSON.stringify({ sellerName: parsed.data.sellerName, strategy: parsed.data.strategy, offers: parsed.data.offers, ...result })}`;
    const saved = await db.transaction(async tx => {
      const rows = await tx.update(schema.leads).set({ notes: sql`${schema.leads.notes} || ${note}`, ...(result.handoff?.reason === 'opt_out' ? { stage: 'do_not_contact' as const } : {}) }).where(and(where, sql`length(${schema.leads.notes}) < 200000`)).returning({id:schema.leads.id});
      if (!rows.length) throw new Error('COMMERCIAL_SAVE_CONFLICT');
      if (result.handoff) {
        await tx.update(schema.enrollments).set({state:'stopped'}).where(and(eq(schema.enrollments.orgId,ctx.org.id),eq(schema.enrollments.leadId,lead.id),inArray(schema.enrollments.state,['running','waiting_accept'])));
        await tx.update(schema.actions).set({status:'skipped'}).where(and(eq(schema.actions.orgId,ctx.org.id),eq(schema.actions.leadId,lead.id),eq(schema.actions.status,'pending')));
      }
      return rows;
    });
    // Notifica o responsável do encaminhamento (só depois de salvar com sucesso).
    if (saved.length && result.handoff) {
      const [s] = await db.select({ senderEmail: schema.orgSettings.senderEmail }).from(schema.orgSettings).where(eq(schema.orgSettings.orgId, ctx.org.id));
      await notifyHandoff(result.handoff, lead.fullName, result.offer, s?.senderEmail);
    }
    revalidatePath('/leads');
    revalidatePath('/fila');
    revalidatePath('/campanhas');
    return { result, saved: Boolean(saved.length), ...(!saved.length ? { error: 'Rascunho gerado, mas não salvo: a carteira mudou ou o limite de notas foi atingido.' } : {}) };
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'AI_NOT_CONFIGURED') return { error: 'O provedor de IA ainda não está configurado pelo administrador.' };
    if (code === 'AI_FREE_MODEL_REQUIRED') return { error: 'Configure um modelo gratuito de IA para esta operação.' };
    if (code === 'AI_INVALID_RESPONSE') return { error: 'A resposta da IA não passou na validação. Nenhum rascunho foi salvo. Tente novamente.' };
    return { error: 'Não foi possível gerar ou salvar agora. Nenhuma mensagem foi enviada.' };
  }
}
