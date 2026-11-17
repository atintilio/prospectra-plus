export type DiscPrimary = 'D' | 'I' | 'S' | 'C';
export type DiscConfidence = 'low' | 'medium' | 'high';

export type DiscAnalysis = {
  primary: DiscPrimary;
  archetype: string;
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

type PublicEvidence = { source: string; url: string; text: string };
type DiscInput = { text: string; evidence: (string | PublicEvidence)[] };

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

const profile: Record<DiscPrimary, Omit<DiscAnalysis, 'primary' | 'scores' | 'confidence' | 'recommendations' | 'avoid' | 'questions' | 'disclaimer' | 'evidence'>> = {
  D: { archetype: 'Executor', behavior: ['Decide com foco em objetivo, autonomia e velocidade.'], motivators: ['Resultado visível', 'Autonomia', 'Desafio'], drainers: ['Burocracia', 'Indecisão', 'Explicações sem conclusão'], writingStyle: ['curta e orientada a resultado'], speakingStyle: ['direta, objetiva e com próximo passo'] },
  I: { archetype: 'Influenciador', behavior: ['Constrói energia por conexão, visão e reconhecimento.'], motivators: ['Oportunidade', 'Relacionamento', 'Visibilidade'], drainers: ['Abordagem fria', 'Repetição', 'Excesso de formalidade'], writingStyle: ['leve, humana e com contexto'], speakingStyle: ['conversacional, positiva e aberta'] },
  S: { archetype: 'Apoiador', behavior: ['Valoriza confiança, continuidade e impacto na equipe.'], motivators: ['Segurança', 'Colaboração', 'Previsibilidade'], drainers: ['Pressão', 'Mudança brusca', 'Promessas vagas'], writingStyle: ['acolhedora e gradual'], speakingStyle: ['calma, consultiva e paciente'] },
  C: { archetype: 'Analista', behavior: ['Compara alternativas e procura consistência antes de decidir.'], motivators: ['Precisão', 'Qualidade', 'Evidência'], drainers: ['Improviso', 'Exagero', 'Dados sem fonte'], writingStyle: ['estruturada', 'precisa e baseada em evidências'], speakingStyle: ['técnica, clara e com tempo para perguntas'] },
};

export function analyzeDisc(input: DiscInput): DiscAnalysis {
  const publicEvidence = input.evidence.filter((item): item is PublicEvidence => typeof item !== 'string');
  const text = `${input.text} ${input.evidence.map((item) => typeof item === 'string' ? item : item.text).join(' ')}`.toLocaleLowerCase();
  const scores = (Object.keys(signals) as DiscPrimary[]).reduce((acc, key) => {
    acc[key] = signals[key].words.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
    return acc;
  }, {} as Record<DiscPrimary, number>);
  const primary = (Object.keys(scores) as DiscPrimary[]).sort((a, b) => scores[b] - scores[a])[0];
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence: DiscConfidence = total >= 5 ? 'high' : total >= 2 ? 'medium' : 'low';
  const details = profile[primary];
  return {
    primary,
    ...details,
    scores,
    confidence,
    recommendations: signals[primary].recommendations,
    avoid: signals[primary].avoid,
    questions: signals[primary].questions,
    disclaimer: 'Esta é uma estimativa DISC a partir de sinais observáveis; não é diagnóstico psicológico e deve ser validada na conversa.',
    evidence: publicEvidence,
  };
}
