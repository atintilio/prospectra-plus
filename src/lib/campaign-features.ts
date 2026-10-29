// Recursos de campanha que cada operação ativa dentro do Prospectra.
//
// Desligados por padrão: um passo de campanha (imagem/informativo, ligação) só é
// oferecido no editor e só age enquanto a operação o tiver ativado. A ativação é
// feita pelo administrador master em /admin — nada aqui depende de variável de
// ambiente, porque o que vale é a decisão da operação, não o deploy.
//
// Regra única, aplicada em três camadas:
//  1. Editor: o tipo de passo não é oferecido (passos já existentes continuam visíveis).
//  2. Cadência: passo ainda não alcançado com recurso desligado é pulado (não age).
//  3. Fila: ação já criada antes da desactivação continua pendente, nada automático.

export const CAMPAIGN_FEATURES = ['image', 'call'] as const;
export type CampaignFeature = (typeof CAMPAIGN_FEATURES)[number];

/** Tipos de passo que dependem de activação explícita da operação. */
const GATED_STEP_TYPES: Record<string, CampaignFeature> = { image: 'image', call: 'call' };

export type FeatureOrg = { active: boolean; isDemo: boolean; imageEnabled: boolean; callEnabled: boolean };
export type CampaignFeatures = Record<CampaignFeature, boolean>;

/** Recursos ativos na operação. Operação inativa ou demonstração nunca tem recurso. */
export function campaignFeatures(org: FeatureOrg): CampaignFeatures {
  const base = org.active && !org.isDemo;
  return { image: base && org.imageEnabled, call: base && org.callEnabled };
}

/** O tipo de passo pode ser usado nesta operação? Tipos sem gate estão sempre disponíveis. */
export function stepTypeEnabled(features: CampaignFeatures, type: string): boolean {
  const feature = GATED_STEP_TYPES[type];
  return feature ? features[feature] : true;
}

/** Recurso que um tipo de passo exige (undefined quando não há gate). */
export function featureForStep(type: string): CampaignFeature | undefined {
  return GATED_STEP_TYPES[type];
}
