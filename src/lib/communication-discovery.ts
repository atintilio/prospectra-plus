import 'server-only';
import { aiComplete, aiConfigured } from './ai';
import { isDiscType, type DiscQuadrant, type DiscType } from './communication-guidance';

// Descoberta automática do estilo DISC a partir do texto do perfil (estilo "Previsto" do Crystal).
// A IA (GLM via OpenRouter/Z.AI) é a primária; sem IA ou sem sinal, cai num analisador léxico local.
// Sempre uma ESTIMATIVA — nunca um tipo declarado.

const QUADRANTS: DiscQuadrant[] = ['D', 'I', 'S', 'C'];
const CUES: Record<DiscQuadrant, RegExp> = {
  D: /\b(resultad\w+|metas?|decis\w+|lider\w+|r[aá]pid\w+|diret\w+|desafi\w+|ganhar|objetiv\w+|don[oa]|ceo|founder|fundador\w*|head|diretor\w*|vp|execu\w+)\b/gi,
  I: /\b(pessoas|network\w*|comunidade|entusiasm\w+|criativ\w+|ideias?|inspir\w+|eventos?|palestr\w+|influenc\w+|social|storytelling|carism\w+)\b/gi,
  S: /\b(equipes?|apoi\w+|rela[cç]\w+|confian[cç]\w+|suporte|paciente|colabora\w+|cuidar|est[aá]vel|harmoni\w+|longo prazo|mentor\w+)\b/gi,
  C: /\b(dados|an[aá]lis\w+|detalh\w+|qualidade|precis\w+|t[eé]cnic\w+|engenh\w+|pesquis\w+|m[eé]trica\w*|normas?|complian\w+|processos?|arquitet\w+)\b/gi,
};

export function lexicalDiscScores(text: string): { quadrant: DiscQuadrant | null; scores: Record<DiscQuadrant, number> } {
  const scores: Record<DiscQuadrant, number> = { D: 0, I: 0, S: 0, C: 0 };
  for (const q of QUADRANTS) scores[q] = (text.match(CUES[q]) ?? []).length;
  const top = QUADRANTS.slice().sort((a, b) => scores[b] - scores[a])[0];
  return { quadrant: scores[top] > 0 ? top : null, scores };
}

/** Infere o tipo DISC do texto. Retorna null quando não há sinal suficiente. */
export async function inferDisc(text: string): Promise<{ type: DiscType | null; source: 'ai' | 'lexical' }> {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length < 12) return { type: null, source: 'lexical' };

  if (aiConfigured()) {
    try {
      const raw = await aiComplete(
        'Você classifica o estilo de comunicação DISC de uma pessoa a partir do texto do perfil dela (cargo, bio, amostras de escrita). '
        + 'Responda APENAS com JSON {"type":"<um dos 16 tipos DISC ou null>"}. '
        + 'Tipos válidos: D, Di, DI, Dc, I, Id, Is, IS, S, Si, Sc, SC, C, Cs, Cd, CD. '
        + 'Se não houver sinal suficiente, responda {"type":null}. Não invente nem explique.',
        clean.slice(0, 4000),
        120,
      );
      const slice = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
      const json = JSON.parse(slice) as { type?: unknown };
      if (isDiscType(json.type)) return { type: json.type, source: 'ai' };
      if (json.type === null) return { type: null, source: 'ai' };
    } catch { /* cai no analisador léxico */ }
  }

  const { quadrant } = lexicalDiscScores(clean); // o quadrante base (D/I/S/C) é um DiscType válido
  return { type: quadrant, source: 'lexical' };
}
