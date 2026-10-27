'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { commercialInputSchema, generateCommercial, type CommercialResult } from '@/lib/harvey';

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
