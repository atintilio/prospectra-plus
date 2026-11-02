import { schema, type DB } from '@/db';
import type { CampaignStep } from '@/db/schema';

/**
 * Fluxos de demonstração.
 *
 * A demonstração mostra o módulo de fluxos pronto: dois modelos de cadência
 * (o mesmo desenho das campanhas da demo) e uma campanha que já usa um deles.
 * Tudo fictício e idempotente — nada é enviado de verdade.
 */

/** Rótulo do bloco, a partir do tipo do passo. */
const LABELS: Record<string, string> = {
  react: 'Reagir ao post', comment: 'Comentar o post', invite: 'Enviar convite',
  message: 'Mensagem no LinkedIn', email: 'E-mail', whatsapp: 'Mensagem no WhatsApp',
  voice: 'Áudio na sua voz', image: 'Enviar informativo', call: 'Ligar (assistida)',
};

export async function seedFlows(
  db: DB,
  orgId: string,
  userId: string,
  stepsA: CampaignStep[],
  stepsB: CampaignStep[],
): Promise<{ abertura: string; parcerias: string }> {
  const [abertura, parcerias] = await db.insert(schema.flows).values([
    {
      orgId,
      name: 'Abertura quente · decisores de financeiro',
      description: 'Reagir, convidar, lembrar e oferecer diagnóstico. Serve para CFOs e diretores.',
      status: 'active',
      createdBy: userId,
    },
    {
      orgId,
      name: 'Parcerias · escritórios contábeis',
      description: 'Convite curto, mensagem de parceria e convite para o modelo de indicação.',
      status: 'draft',
      createdBy: userId,
    },
  ]).returning();

  const rows = [
    ...stepsA.map((step, index) => ({ flowId: abertura.id, orgId, position: index, step })),
    ...stepsB.map((step, index) => ({ flowId: parcerias.id, orgId, position: index, step })),
  ].map(({ flowId, orgId: flowOrgId, position, step }) => ({
    flowId,
    orgId: flowOrgId,
    position,
    type: step.type,
    name: LABELS[step.type] ?? '',
    delayDays: step.delayDays,
    condition: step.condition,
    template: step.template,
    useAi: step.useAi,
    subject: '',
    mediaUrl: '',
  }));

  if (rows.length) await db.insert(schema.flowSteps).values(rows);

  return { abertura: abertura.id, parcerias: parcerias.id };
}
