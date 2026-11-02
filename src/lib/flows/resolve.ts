import { and, asc, eq } from 'drizzle-orm';
import type { DB } from '@/db';
import * as schema from '@/db/schema';
import type { CampaignStep } from '@/db/schema';
import type { FlowStep } from './types';

/**
 * Resolução das etapas de uma campanha — PRD docs/PRD-2026-11-02-FLUXO-NATIVO.md §6.
 *
 * O fluxo é MODELO e a campanha é a EXECUÇÃO (não há motor novo aqui):
 *  - campanha com `campaigns.flow_id`  → as etapas vêm do fluxo, ordenadas por `flow_steps.position`;
 *  - campanha sem `campaigns.flow_id`  → vale `campaigns.steps`, exatamente como antes.
 *
 * A função recebe o `db` por injeção (para poder ser testada sem servidor) e devolve
 * a lista de etapas no MESMO formato que o motor de cadência (src/lib/cadence.ts)
 * já consome: nada mais precisa mudar no motor além de ler as etapas por aqui.
 */

/** Etapa resolvida: o `CampaignStep` do motor + o rótulo do bloco do fluxo (só para a tela). */
export type ResolvedStep = CampaignStep & { name?: string };

/** O mínimo de uma campanha que a resolução precisa. */
export type CampaignRef = {
  id?: string;
  orgId: string;
  flowId?: string | null;
  steps?: CampaignStep[] | null;
};

/** Campos do passo do fluxo que viram etapa do motor. */
export type FlowStepRow = Pick<FlowStep, 'id' | 'type' | 'delayDays' | 'condition' | 'template' | 'useAi' | 'subject' | 'mediaUrl' | 'name'>;

/**
 * Converte um passo do fluxo (`flow_steps`) no formato `CampaignStep` que o motor usa.
 *
 *  - id        ← `flow_steps.id` (uuid do bloco; a ordem é a `position`, não o id)
 *  - type      ← `flow_steps.type` (mesmo conjunto da cadência: react…call)
 *  - delayDays ← `flow_steps.delay_days` (dias de espera antes do passo)
 *  - condition ← `flow_steps.condition` ('always' | 'accepted')
 *  - template  ← `flow_steps.template` (texto base)
 *  - useAi     ← `flow_steps.use_ai` (personalizar com IA)
 *  - subject   ← `flow_steps.subject` (assunto do e-mail; vazio → undefined)
 *  - mediaUrl  ← `flow_steps.media_url` (URL da mídia; vazio → undefined)
 *  - name      ← `flow_steps.name` (rótulo do bloco; extra opcional, só para a tela)
 */
export function flowStepToCampaignStep(step: FlowStepRow): ResolvedStep {
  return {
    id: step.id,
    type: step.type,
    delayDays: step.delayDays,
    condition: step.condition,
    template: step.template,
    useAi: step.useAi,
    subject: step.subject || undefined,
    mediaUrl: step.mediaUrl || undefined,
    name: step.name || undefined,
  };
}

/**
 * Etapas que a cadência da campanha deve executar.
 *
 * Com fluxo: as etapas do fluxo (ordenadas por `position`). Sem fluxo: `campaigns.steps`.
 * Fluxo de outra operação não entra (a query exige `flow_steps.org_id` e `flows.org_id`
 * iguais à operação da campanha) — isolamento por operação, como o resto do produto.
 *
 * Fluxo sem etapas devolve lista vazia: quem decide a ordem das etapas é o fluxo.
 */
export async function resolveSteps(db: DB, campaign: CampaignRef): Promise<ResolvedStep[]> {
  const flowId = campaign.flowId ?? null;
  if (!flowId) return campaign.steps ?? [];
  const rows = await db
    .select({
      id: schema.flowSteps.id,
      type: schema.flowSteps.type,
      delayDays: schema.flowSteps.delayDays,
      condition: schema.flowSteps.condition,
      template: schema.flowSteps.template,
      useAi: schema.flowSteps.useAi,
      subject: schema.flowSteps.subject,
      mediaUrl: schema.flowSteps.mediaUrl,
      name: schema.flowSteps.name,
    })
    .from(schema.flowSteps)
    .innerJoin(
      schema.flows,
      and(eq(schema.flows.id, schema.flowSteps.flowId), eq(schema.flows.orgId, campaign.orgId)),
    )
    .where(and(eq(schema.flowSteps.flowId, flowId), eq(schema.flowSteps.orgId, campaign.orgId)))
    .orderBy(asc(schema.flowSteps.position), asc(schema.flowSteps.id));
  return rows.map(flowStepToCampaignStep);
}
