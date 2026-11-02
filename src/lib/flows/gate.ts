import { stepTypeEnabled, type CampaignFeatures } from '@/lib/campaign-features';
import { FLOW_STEP_TYPES, type FlowStepType } from './types';

/**
 * Gate do fluxo nativo.
 *
 * A regra é a MESMA das campanhas (`src/lib/campaign-features.ts`): um bloco que
 * depende de recurso desligado na operação não é oferecido na paleta e não age
 * na cadência. Aqui só se decide o que a paleta oferece e o que está travado —
 * a regra em si não é reimplementada.
 */

/** O tipo de bloco pode ser usado nesta operação? */
export function flowStepTypeEnabled(features: CampaignFeatures, type: FlowStepType): boolean {
  return stepTypeEnabled(features, type);
}

/** Tipos liberados nesta operação: é o que a paleta oferece. */
export function availableFlowStepTypes(features: CampaignFeatures): FlowStepType[] {
  return FLOW_STEP_TYPES.filter((type) => stepTypeEnabled(features, type));
}

/**
 * Tipos travados nesta operação: não entram na paleta, mas uma etapa já
 * existente continua visível (com aviso) — igual acontece no editor de campanha.
 */
export function flowBlockedTypes(features: CampaignFeatures): FlowStepType[] {
  return FLOW_STEP_TYPES.filter((type) => !stepTypeEnabled(features, type));
}
