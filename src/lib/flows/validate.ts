import { stepTypeEnabled, type CampaignFeatures } from '@/lib/campaign-features';
import { FLOW_STEP_BLOCKS, type FlowStepType } from './types';

/**
 * Validação das etapas de um fluxo — as mesmas regras que valem no servidor,
 * isoladas em uma lib pura para poderem ser testadas sem servidor.
 */

/** Etapa que o construtor manipula (o mesmo formato salvo no banco). */
export type FlowStepInput = {
  id: string;
  type: FlowStepType;
  name: string;
  delayDays: number;
  condition: 'always' | 'accepted';
  template: string;
  useAi: boolean;
  subject: string;
  mediaUrl: string;
};

/** Blocos que rodam sem texto (a reação do LinkedIn não manda mensagem). */
const SEM_TEXTO: FlowStepType[] = ['react'];

/**
 * Confere a sequência antes de gravar.
 *
 * Gate (camada 1 — o construtor): bloco de recurso desligado na operação não
 * entra. Uma etapa que **já existia** e ficou travada continua salva — quem
 * decide se ela age é a cadência (camada 2), não o construtor.
 *
 * Texto: todo bloco que manda mensagem precisa de texto ou da IA ligada.
 *
 * Devolve a mensagem de erro ou `null` quando a sequência está boa.
 */
export function validateFlowSteps(
  features: CampaignFeatures,
  steps: readonly FlowStepInput[],
  knownIds: ReadonlySet<string> = new Set<string>(),
  options: { demo?: boolean } = {},
): string | null {
  // Na demonstração nada é enviado de verdade: o gate não prende a construção.
  if (!options.demo) {
    for (const step of steps) {
      if (stepTypeEnabled(features, step.type)) continue;
      if (knownIds.has(step.id)) continue;
      return `A operação não ativou "${FLOW_STEP_BLOCKS[step.type].short}". Ative o recurso ou remova o bloco.`;
    }
  }
  for (const step of steps) {
    if (SEM_TEXTO.includes(step.type)) continue;
    if (step.template.trim() || step.useAi) continue;
    return 'Escreva o texto de cada bloco ou ligue a IA.';
  }
  return null;
}
