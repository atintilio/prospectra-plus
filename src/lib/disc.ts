// Análise DISC própria (sem API paga), alinhada ao modelo do Crystal:
// tipo primário/secundário, percentuais d/i/s/c, intensidade e arquétipo.
// É uma ESTIMATIVA de comunicação por sinais observáveis — não é diagnóstico.

export type DiscPrimary = 'D' | 'I' | 'S' | 'C';
export type DiscConfidence = 'low' | 'medium' | 'high';
export type DiscPercentages = { d: number; i: number; s: number; c: number };

export type DiscAnalysis = {
  primary: DiscPrimary;
  discType: string;          // ex.: "D", "Di", "DI" (compatível com o Crystal)
  archetype: string;         // nome do arquétipo do tipo (Crystal)
  intensity: number;         // 0–100: quão pronunciado é o primário
  percentages: DiscPercentages;
  scores: Record<DiscPrimary, number>;
  confidence: DiscConfidence;
  behavior: string[];
  motivators: string[];
  drainers: string[];
  writingStyle: string[];
  speakingStyle: string[];
  recommendations: string[];
  avoid: string[];
  questions: string[];
  disclaimer: string;
  evidence: { source: string; url: string; text: string }[];
};

export type DiscEvidence = { source: string; url: string; text: string };
type PublicEvidence = DiscEvidence;
export type DiscInput = { text: string; evidence: (string | PublicEvidence)[] };

const signals: Record<DiscPrimary, { words: string[]; recommendations: string[]; avoid: string[]; questions: string[] }> = {
  D: {
    words: ['ceo', 'diretor', 'decisão', 'decisao', 'meta', 'resultado', 'crescimento', 'urgente', 'liderança', 'lideranca', 'performance'],
    recommendations: ['Vá direto ao ponto e comece pelo resultado esperado.', 'Ofereça opções claras e um próximo passo objetivo.'],
    avoid: ['Evite textos longos antes de apresentar a proposta.', 'Não esconda prazo, investimento ou condição importante.'],
    questions: ['Qual resultado precisa mudar primeiro?', 'O que impediria uma decisão nesta semana?'],
  },
  I: {
    words: ['palestra', 'comunidade', 'parceria', 'marca', 'eventos', 'inovação', 'inovacao', 'networking', 'influência', 'influencia'],
    recommendations: ['Comece pela visão, pelo impacto e pela oportunidade.', 'Use uma linguagem humana e convide para uma troca de ideias.'],
    avoid: ['Evite uma abordagem fria, excessivamente técnica ou sem contexto.', 'Não transforme a primeira conversa em um formulário.'],
    questions: ['Que oportunidade deixaria essa conversa especialmente valiosa?', 'Quem mais deveria participar dessa discussão?'],
  },
  S: {
    words: ['equipe', 'clientes', 'parceiros', 'suporte', 'processo', 'cuidado', 'colaboração', 'colaboracao', 'continuidade', 'confiança', 'confianca'],
    recommendations: ['Mostre como a mudança será conduzida com segurança e apoio.', 'Dê espaço para a pessoa explicar o contexto antes de propor a solução.'],
    avoid: ['Evite pressão artificial e urgência sem justificativa.', 'Não prometa uma mudança instantânea sem explicar o acompanhamento.'],
    questions: ['Como sua equipe prefere conduzir uma mudança assim?', 'O que tornaria essa transição confortável para todos?'],
  },
  C: {
    words: ['análise', 'analise', 'dados', 'compliance', 'risco', 'processo', 'métrica', 'metrica', 'tecnologia', 'qualidade', 'evidência', 'evidencia'],
    recommendations: ['Apresente fatos, critérios, evidências e limites da proposta.', 'Envie um resumo estruturado para a pessoa avaliar com calma.'],
    avoid: ['Evite afirmações absolutas sem fonte ou critério verificável.', 'Não force uma decisão antes de responder às dúvidas relevantes.'],
    questions: ['Quais critérios você usaria para avaliar essa alternativa?', 'Que evidência falta para avançarmos com segurança?'],
  },
};

type ProfileDetail = Pick<DiscAnalysis, 'behavior' | 'motivators' | 'drainers' | 'writingStyle' | 'speakingStyle'>;
const profile: Record<DiscPrimary, ProfileDetail> = {
  D: { behavior: ['Decide com foco em objetivo, autonomia e velocidade.'], motivators: ['Resultado visível', 'Autonomia', 'Desafio'], drainers: ['Burocracia', 'Indecisão', 'Explicações sem conclusão'], writingStyle: ['curta e orientada a resultado'], speakingStyle: ['direta, objetiva e com próximo passo'] },
  I: { behavior: ['Constrói energia por conexão, visão e reconhecimento.'], motivators: ['Oportunidade', 'Relacionamento', 'Visibilidade'], drainers: ['Abordagem fria', 'Repetição', 'Excesso de formalidade'], writingStyle: ['leve, humana e com contexto'], speakingStyle: ['conversacional, positiva e aberta'] },
  S: { behavior: ['Valoriza confiança, continuidade e impacto na equipe.'], motivators: ['Segurança', 'Colaboração', 'Previsibilidade'], drainers: ['Pressão', 'Mudança brusca', 'Promessas vagas'], writingStyle: ['acolhedora e gradual'], speakingStyle: ['calma, consultiva e paciente'] },
  C: { behavior: ['Compara alternativas e procura consistência antes de decidir.'], motivators: ['Precisão', 'Qualidade', 'Evidência'], drainers: ['Improviso', 'Exagero', 'Dados sem fonte'], writingStyle: ['estruturada', 'precisa e baseada em evidências'], speakingStyle: ['técnica, clara e com tempo para perguntas'] },
};

// Arquétipos do Crystal por tipo DISC.
const ARCHETYPE: Record<string, string> = {
  D: 'Captain', Di: 'Driver', DI: 'Initiator', Dc: 'Architect',
  I: 'Motivator', Id: 'Influencer', Is: 'Encourager', IS: 'Harmonizer',
  S: 'Supporter', Si: 'Counselor', Sc: 'Planner', SC: 'Stabilizer',
  C: 'Analyst', Cs: 'Editor', Cd: 'Skeptic', CD: 'Questioner',
};
// Vizinhos no circumplexo (pares válidos). Opostos (D–S, I–C) não formam tipo combinado.
const NEIGHBORS: Record<DiscPrimary, DiscPrimary[]> = { D: ['I', 'C'], I: ['D', 'S'], S: ['I', 'C'], C: ['S', 'D'] };

function resolveDiscType(primary: DiscPrimary, secondary: DiscPrimary | null, scores: Record<DiscPrimary, number>): string {
  if (!secondary || scores[secondary] === 0 || !NEIGHBORS[primary].includes(secondary)) return primary;
  const strong = scores[secondary] >= scores[primary] * 0.8;
  for (const candidate of [`${primary}${strong ? secondary : secondary.toLowerCase()}`, `${primary}${secondary.toLowerCase()}`, primary]) {
    if (candidate in ARCHETYPE) return candidate;
  }
  return primary;
}

function toPercentages(scores: Record<DiscPrimary, number>): DiscPercentages {
  const keys: DiscPrimary[] = ['D', 'I', 'S', 'C'];
  const total = keys.reduce((a, k) => a + scores[k], 0);
  if (total === 0) return { d: 25, i: 25, s: 25, c: 25 };
  const pct = keys.map((k) => ({ k, v: Math.round((scores[k] / total) * 100) }));
  const drift = 100 - pct.reduce((a, p) => a + p.v, 0);
  const top = pct.reduce((a, b) => (b.v > a.v ? b : a));
  top.v += drift; // corrige arredondamento para somar 100
  const map = Object.fromEntries(pct.map((p) => [p.k.toLowerCase(), p.v]));
  return { d: map.d, i: map.i, s: map.s, c: map.c };
}

/**
 * Monta um DiscAnalysis a partir de percentuais d/i/s/c (ex.: vindos do GLM sobre
 * evidências coletadas). Campos de texto (recomendações, evite, perguntas, comportamento)
 * usam os defaults do primário quando não fornecidos.
 */
export function discFromPercentages(
  pct: DiscPercentages,
  opts: { confidence: DiscConfidence; evidence: DiscEvidence[]; recommendations?: string[]; avoid?: string[]; questions?: string[]; behavior?: string[] },
): DiscAnalysis {
  const scores: Record<DiscPrimary, number> = { D: pct.d, I: pct.i, S: pct.s, C: pct.c };
  const ranked = (['D', 'I', 'S', 'C'] as DiscPrimary[]).sort((a, b) => scores[b] - scores[a]);
  const primary = ranked[0];
  const secondary = scores[ranked[1]] > 0 ? ranked[1] : null;
  const discType = resolveDiscType(primary, secondary, scores);
  return {
    primary,
    discType,
    archetype: ARCHETYPE[discType] ?? ARCHETYPE[primary],
    intensity: pct[primary.toLowerCase() as keyof DiscPercentages],
    percentages: pct,
    scores,
    confidence: opts.confidence,
    ...profile[primary],
    ...(opts.behavior?.length ? { behavior: opts.behavior } : {}),
    recommendations: opts.recommendations?.length ? opts.recommendations : signals[primary].recommendations,
    avoid: opts.avoid?.length ? opts.avoid : signals[primary].avoid,
    questions: opts.questions?.length ? opts.questions : signals[primary].questions,
    disclaimer: 'Esta é uma estimativa DISC a partir de sinais observáveis; não é diagnóstico psicológico e deve ser validada na conversa.',
    evidence: opts.evidence,
  };
}

export function analyzeDisc(input: DiscInput): DiscAnalysis {
  const publicEvidence = input.evidence.filter((item): item is PublicEvidence => typeof item !== 'string');
  const text = `${input.text} ${input.evidence.map((item) => (typeof item === 'string' ? item : item.text)).join(' ')}`.toLocaleLowerCase();
  const keys: DiscPrimary[] = ['D', 'I', 'S', 'C'];
  const scores = keys.reduce((acc, key) => {
    acc[key] = signals[key].words.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
    return acc;
  }, {} as Record<DiscPrimary, number>);
  const ranked = [...keys].sort((a, b) => scores[b] - scores[a]);
  const primary = ranked[0];
  const secondary = scores[ranked[1]] > 0 ? ranked[1] : null;
  const total = keys.reduce((a, k) => a + scores[k], 0);
  const confidence: DiscConfidence = total >= 5 ? 'high' : total >= 2 ? 'medium' : 'low';
  const percentages = toPercentages(scores);
  const discType = resolveDiscType(primary, secondary, scores);
  return {
    primary,
    discType,
    archetype: ARCHETYPE[discType] ?? ARCHETYPE[primary],
    intensity: percentages[primary.toLowerCase() as keyof DiscPercentages],
    percentages,
    scores,
    confidence,
    ...profile[primary],
    recommendations: signals[primary].recommendations,
    avoid: signals[primary].avoid,
    questions: signals[primary].questions,
    disclaimer: 'Esta é uma estimativa DISC a partir de sinais observáveis; não é diagnóstico psicológico e deve ser validada na conversa.',
    evidence: publicEvidence,
  };
}
