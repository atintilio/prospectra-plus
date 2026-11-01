/**
 * Seed de demonstração — módulo LinkedIn.
 *
 * Cria a persona **João da Silva** (SDR da operação de demonstração
 * "Demonstração · Atlas Consultoria") com:
 *  - conta do LinkedIn em estado **simulado/conectado** (`linkedin_connections`),
 *    para a tela `/linkedin` e para o card do piloto mostrarem um caso completo;
 *  - uma campanha própria de LinkedIn (convite → mensagem) atribuída a ele;
 *  - duas ações pendentes na fila do dia, como um SDR com trabalho a fazer.
 *
 * Regras (as mesmas dos outros módulos de demo):
 * - **Nada de rede**: só INSERTs em dados fictícios já coerentes com a demo.
 * - **Idempotente**: ids determinísticos e `onConflictDoNothing`, então rodar de
 *   novo não duplica nada.
 * - A conexão é **simulada**: nenhum token, nenhum cookie, nenhum contato real.
 *   O interruptor global `LINKEDIN_AUTOMATION_ENABLED` continua desligado, então
 *   a demonstração nunca despacha nada para o LinkedIn.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { schema, type DB } from '@/db';
import type { CampaignStep } from '@/db/schema';
import { addDays, dayString } from '@/lib/cadence';
import { hashPassword } from '@/lib/crypto';

/** E-mail fictício do João — domínio de demonstração, nunca entregável. */
export const DEMO_LINKEDIN_EMAIL = 'joao.silva@atlasconsultoria.demo';

const STEPS_LINKEDIN: CampaignStep[] = [
  { id: 's1', type: 'react', delayDays: 0, condition: 'always', template: '', useAi: false },
  { id: 's2', type: 'invite', delayDays: 1, condition: 'always', template: 'Olá, {nome}! Vi o trabalho da {empresa} e gostaria de conectar.', useAi: true },
  { id: 's3', type: 'message', delayDays: 2, condition: 'accepted', template: '{nome}, obrigado por aceitar! Posso te enviar um diagnóstico da {empresa}?', useAi: false },
];

export type DemoLinkedInSummary = {
  userId: string;
  connectionId: string;
  campaignId: string;
  pendingActions: number;
};

/**
 * Semeia a persona do LinkedIn na operação de demonstração.
 * `leads` recebe leads da demo para gerar a fila pendente do João.
 */
export async function seedLinkedIn(ctx: {
  db: DB;
  orgId: string;
  now: Date;
  leads: Array<{ id: string; fullName: string; company: string; headline: string }>;
}): Promise<DemoLinkedInSummary> {
  const { db, orgId, now } = ctx;

  // 1) O usuário fictício (SDR ativo da demo).
  const pw = await hashPassword(Math.random().toString(36));
  const [joao] = await db
    .insert(schema.users)
    .values({
      email: DEMO_LINKEDIN_EMAIL,
      name: 'João da Silva',
      status: 'active',
      passwordHash: pw,
      linkedinUrl: 'https://www.linkedin.com/in/joao-da-silva-demo',
      dailyInvites: 20,
      dailyMessages: 40,
    })
    .onConflictDoNothing({ target: schema.users.email })
    .returning();
  const userId = joao?.id
    ?? (await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_LINKEDIN_EMAIL)).limit(1))[0]?.id;
  if (!userId) throw new Error('demo-linkedin: usuário da persona não encontrado');

  await db
    .insert(schema.memberships)
    .values({ orgId, userId, role: 'sdr' })
    .onConflictDoNothing();

  // 2) A conta conectada — SIMULADA (sem token, sem cookie, sem contato real).
  const connectedAt = addDays(now, -30);
  const [connection] = await db
    .insert(schema.linkedinConnections)
    .values({
      orgId,
      userId,
      providerId: 'demo-joao-silva',
      profileName: 'João da Silva',
      profileEmail: DEMO_LINKEDIN_EMAIL,
      status: 'connected',
      scopes: 'openid profile email',
      connectedAt,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: [schema.linkedinConnections.orgId, schema.linkedinConnections.userId] })
    .returning();

  // 3) A campanha de LinkedIn do João.
  const [camp] = await db
    .insert(schema.campaigns)
    .values({
      orgId,
      ownerId: userId,
      assignedTo: userId,
      name: 'Prospecção ativa · LinkedIn',
      status: 'active',
      steps: STEPS_LINKEDIN,
      aiBrief: 'Tom consultivo; proposta de diagnóstico rápido da operação.',
    })
    .onConflictDoNothing()
    .returning();
  const campaignId = camp?.id
    ?? (await db.select({ id: schema.campaigns.id }).from(schema.campaigns)
      .where(eq(schema.campaigns.orgId, orgId)).limit(1))[0]?.id;
  if (!campaignId) throw new Error('demo-linkedin: campanha da persona não encontrada');

  // 4) A fila do dia do João: duas ações pendentes de LinkedIn.
  let pendingActions = 0;
  const targets = ctx.leads.slice(0, 2);
  for (const lead of targets) {
    const [inserted] = await db
      .insert(schema.enrollments)
      .values({
        orgId,
        campaignId,
        leadId: lead.id,
        stepIndex: 1,
        state: 'running',
        nextRunAt: addDays(now, 3650),
      })
      .onConflictDoNothing()
      .returning();
    // Idempotência: na segunda execução o INSERT não devolve linha (um lead tem
    // apenas uma inscrição ativa por operação — índice único parcial no schema).
    // Reaproveitamos a inscrição existente em vez de tentar criar outra.
    const enr =
      inserted
      ?? (await db
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.orgId, orgId),
            eq(schema.enrollments.leadId, lead.id),
            inArray(schema.enrollments.state, ['running', 'waiting_accept']),
          ),
        )
        .limit(1))[0];
    if (!enr) throw new Error('demo-linkedin: inscrição da persona não encontrada');
    const step = STEPS_LINKEDIN[1];
    await db
      .insert(schema.actions)
      .values({
        orgId,
        enrollmentId: enr.id,
        campaignId,
        leadId: lead.id,
        userId,
        stepIndex: 1,
        type: step.type,
        body: step.template
          .replace('{nome}', lead.fullName.split(' ')[0])
          .replace('{empresa}', lead.company)
          .replace('{cargo}', lead.headline),
        dueDate: dayString(now),
        status: 'pending',
      })
      .onConflictDoNothing();
    pendingActions++;
  }

  // 5) A operação de demonstração mostra o LinkedIn ligado (é simulação).
  await db.update(schema.orgs).set({ linkedinEnabled: true }).where(eq(schema.orgs.id, orgId));

  return {
    userId,
    connectionId: connection?.id ?? '',
    campaignId,
    pendingActions,
  };
}
