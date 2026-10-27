export const DISC_TYPES = ['D', 'Di', 'DI', 'Dc', 'I', 'Id', 'Is', 'IS', 'S', 'Si', 'Sc', 'SC', 'C', 'Cs', 'Cd', 'CD'] as const;
export type DiscType = (typeof DISC_TYPES)[number];
export type DiscQuadrant = 'D' | 'I' | 'S' | 'C';
export type ObservationAnswer = DiscQuadrant;
export type ObservationAnswers = { q1: ObservationAnswer; q2: ObservationAnswer; q3: ObservationAnswer; q4: ObservationAnswer };
export type CommunicationPreferences = {
  preferredChannel: 'unknown' | 'email' | 'whatsapp' | 'linkedin' | 'call';
  preferredFormat: 'unknown' | 'text' | 'bullets' | 'meeting' | 'audio';
  notes: string;
};
export type CommunicationSource = 'manual' | 'observational_quiz';
export type EvidenceLabel = 'declared' | 'estimate' | 'unavailable';
export type CommunicationScope = { orgId: string; userId: string };
export type CommunicationGuidance = {
  type: DiscType; quadrant: DiscQuadrant; archetype: string; tone: string; format: string;
  channel: string; opening: string; helpful: string[]; avoid: string[];
};

const DISC_META: Record<DiscType, { quadrant: DiscQuadrant; archetype: string; nuance: string }> = {
  D: { quadrant: 'D', archetype: 'Capitão', nuance: 'priorize autonomia e ação.' },
  Di: { quadrant: 'D', archetype: 'Condutor', nuance: 'combine ritmo rápido com espaço para decidir.' },
  DI: { quadrant: 'D', archetype: 'Iniciador', nuance: 'apresente uma oportunidade clara e convide para agir.' },
  Dc: { quadrant: 'D', archetype: 'Arquiteto', nuance: 'ligue o resultado a uma lógica objetiva.' },
  I: { quadrant: 'I', archetype: 'Motivador', nuance: 'abra espaço para ideias e conversa.' },
  Id: { quadrant: 'I', archetype: 'Influenciador', nuance: 'destaque possibilidades e mantenha energia.' },
  Is: { quadrant: 'I', archetype: 'Incentivador', nuance: 'una entusiasmo a atenção à relação.' },
  IS: { quadrant: 'I', archetype: 'Harmonizador', nuance: 'crie conexão e preserve um tom acolhedor.' },
  S: { quadrant: 'S', archetype: 'Apoiador', nuance: 'respeite o ritmo e reduza a pressão.' },
  Si: { quadrant: 'S', archetype: 'Colaborador', nuance: 'valorize troca e continuidade.' },
  Sc: { quadrant: 'S', archetype: 'Planejador', nuance: 'mostre etapas previsíveis e dê tempo para avaliar.' },
  SC: { quadrant: 'S', archetype: 'Estabilizador', nuance: 'destaque segurança, consistência e próximos passos.' },
  C: { quadrant: 'C', archetype: 'Analista', nuance: 'apresente dados verificáveis e critérios claros.' },
  Cs: { quadrant: 'C', archetype: 'Revisor', nuance: 'organize os detalhes com calma e precisão.' },
  Cd: { quadrant: 'C', archetype: 'Questionador', nuance: 'responda objeções com evidências e lógica.' },
  CD: { quadrant: 'C', archetype: 'Cético', nuance: 'separe fatos de hipóteses e evite exageros.' },
};

const QUADRANT_GUIDANCE: Record<DiscQuadrant, Omit<CommunicationGuidance, 'type' | 'quadrant' | 'archetype'>> = {
  D: { tone: 'Direto e respeitoso, com resultado e decisão no início.', format: 'Mensagem curta: contexto, impacto e uma próxima ação.', channel: 'Use o canal preferido do contato; quando desconhecido, ofereça uma opção assíncrona e um convite breve.', opening: 'Quero alinhar um resultado possível e uma próxima decisão. Faz sentido conversarmos sobre isso?', helpful: ['Comece pelo objetivo e pelo impacto prático.', 'Ofereça escolhas claras sem tirar autonomia.', 'Seja conciso e cumpra o prazo combinado.'], avoid: ['Introduções longas antes do ponto principal.', 'Pressão artificial ou promessas sem evidência.', 'Muitas decisões pequenas na mesma mensagem.'] },
  I: { tone: 'Aberto e entusiasmado, mantendo a conversa concreta.', format: 'Mensagem leve com uma ideia central e espaço para resposta.', channel: 'Use o canal preferido do contato; quando desconhecido, convide para uma conversa curta e simples.', opening: 'Vi uma oportunidade que pode render uma boa conversa. Posso compartilhar a ideia em poucas linhas?', helpful: ['Explique o benefício em linguagem acessível.', 'Convide a pessoa a trazer ideias e perguntas.', 'Mantenha o tom positivo sem exagerar.'], avoid: ['Transformar a abordagem em uma lista extensa de especificações.', 'Confundir entusiasmo com certeza de resultado.', 'Fazer pressão para obter resposta imediata.'] },
  S: { tone: 'Calmo, cordial e consistente, sem apressar a decisão.', format: 'Mensagem organizada em etapas com um próximo passo opcional.', channel: 'Respeite o canal preferido; se não souber, pergunte antes de mudar para uma reunião.', opening: 'Posso explicar como isso funcionaria no seu contexto e deixar espaço para avaliar com calma.', helpful: ['Mostre continuidade e o que esperar em cada etapa.', 'Reconheça dúvidas sem tentar encurtar a decisão.', 'Mantenha os compromissos e retornos combinados.'], avoid: ['Urgência artificial ou mudanças inesperadas.', 'Interromper para acelerar a conversa.', 'Apresentar muitas novidades de uma vez.'] },
  C: { tone: 'Preciso e equilibrado, distinguindo dados confirmados de estimativas.', format: 'Resumo estruturado com evidências, condições e detalhes consultáveis.', channel: 'Use o canal preferido; ofereça material escrito para revisão quando a preferência não for conhecida.', opening: 'Separei os pontos verificáveis e as condições para você avaliar se a proposta se aplica.', helpful: ['Explique critérios, limites e fonte dos dados.', 'Responda com clareza quando algo ainda não estiver confirmado.', 'Organize detalhes para consulta posterior.'], avoid: ['Afirmações vagas ou benefícios sem suporte.', 'Pedir decisão antes de apresentar as informações necessárias.', 'Esconder condições ou ressalvas.'] },
};

export function isDiscType(value: unknown): value is DiscType {
  return typeof value === 'string' && DISC_TYPES.includes(value as DiscType);
}

export function canAccessLead(lead: { orgId: string; ownerId: string | null } | null | undefined, scope: CommunicationScope): boolean {
  return Boolean(lead && lead.orgId === scope.orgId && lead.ownerId === scope.userId);
}

export type EstimateResult =
  | { status: 'estimate'; type: DiscQuadrant; scores: Record<DiscQuadrant, number> }
  | { status: 'unavailable'; type: null; scores: Record<DiscQuadrant, number> }
  | { status: 'incomplete'; type: null; scores: Record<DiscQuadrant, number> };

export function estimateDiscType(value: unknown): EstimateResult {
  const zero = { D: 0, I: 0, S: 0, C: 0 };
  if (!value || typeof value !== 'object') return { status: 'incomplete', type: null, scores: zero };
  const answers = value as Record<string, unknown>;
  const keys = ['q1', 'q2', 'q3', 'q4'] as const;
  if (keys.some((key) => !['D', 'I', 'S', 'C'].includes(String(answers[key])))) return { status: 'incomplete', type: null, scores: zero };
  const scores = { ...zero };
  for (const key of keys) scores[answers[key] as DiscQuadrant] += 1;
  const ranked = (Object.entries(scores) as [DiscQuadrant, number][]).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] < 2 || ranked[0][1] === ranked[1][1]) return { status: 'unavailable', type: null, scores };
  return { status: 'estimate', type: ranked[0][0], scores };
}

export function getCommunicationGuidance(value: unknown): CommunicationGuidance | null {
  if (!isDiscType(value)) return null;
  const { quadrant, archetype, nuance } = DISC_META[value];
  const base = QUADRANT_GUIDANCE[quadrant];
  return { type: value, quadrant, archetype, tone: `${base.tone} ${nuance}`, format: base.format, channel: base.channel, opening: base.opening, helpful: base.helpful, avoid: base.avoid };
}

export function sanitizeCommunicationPreferences(value: unknown): CommunicationPreferences {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const channels: CommunicationPreferences['preferredChannel'][] = ['unknown', 'email', 'whatsapp', 'linkedin', 'call'];
  const formats: CommunicationPreferences['preferredFormat'][] = ['unknown', 'text', 'bullets', 'meeting', 'audio'];
  const preferredChannel = channels.includes(input.preferredChannel as CommunicationPreferences['preferredChannel']) ? input.preferredChannel as CommunicationPreferences['preferredChannel'] : 'unknown';
  const preferredFormat = formats.includes(input.preferredFormat as CommunicationPreferences['preferredFormat']) ? input.preferredFormat as CommunicationPreferences['preferredFormat'] : 'unknown';
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 500) : '';
  return { preferredChannel, preferredFormat, notes };
}
