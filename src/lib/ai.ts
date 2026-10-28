import 'server-only';
import type { CampaignStep } from '@/db/schema';
import type { Generator } from './cadence';
import { fillTemplate } from './template';

// Provedor de IA genérico (API compatível com OpenAI): Z.AI/GLM, OpenRouter, etc.
// Troca por env; sem env, mantém o comportamento atual (OpenRouter).
const ENDPOINT = process.env.AI_BASE_URL?.trim() || 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = process.env.AI_MODEL?.trim() || 'qwen/qwen3-30b-a3b:free';
const IS_OPENROUTER = ENDPOINT.includes('openrouter.ai');

function aiKey(): string | undefined {
  return (process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY)?.trim();
}

export function aiConfigured(): boolean {
  return Boolean(aiKey());
}

async function chat(system: string, user: string, maxTokens = 400): Promise<string> {
  const key = aiKey();
  if (!key) throw new Error('AI_NOT_CONFIGURED');
  // o fallback gratuito só existe no OpenRouter; com outro provedor, usa só o modelo configurado
  const models = IS_OPENROUTER ? [DEFAULT_MODEL, 'openrouter/free'] : [DEFAULT_MODEL];
  let lastErr: unknown;
  for (const model of models) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Prospectra' },
        body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.6, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(25_000),
      });
      const data = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (res.ok && text) return text;
      lastErr = new Error(`AI_HTTP_${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

const STEP_GOAL: Record<CampaignStep['type'], string> = {
  invite: 'nota de convite de conexão do LinkedIn, no máximo 280 caracteres, sem vender nada, tom de interesse genuíno',
  message: 'mensagem direta no LinkedIn após a conexão, 2 a 4 frases, uma pergunta aberta no final, sem parecer template',
  comment: 'comentário curto e relevante para um post recente do lead, 1 a 2 frases, sem pitch',
  react: '',
};

export const aiGenerator: Generator = async ({ step, lead, brief }) => {
  if (!aiConfigured() || step.type === 'react') return fillTemplate(step.template, lead);
  const system = 'Você escreve mensagens de prospecção B2B em português do Brasil para o LinkedIn. Responda só com o texto final, sem aspas, sem emojis, sem inventar fatos sobre a pessoa.';
  const user = [
    `Objetivo: ${STEP_GOAL[step.type]}.`,
    brief ? `Contexto da campanha: ${brief}` : '',
    `Modelo de referência (siga a intenção, adapte ao lead): ${fillTemplate(step.template, lead)}`,
    `Lead: ${lead.fullName}; cargo: ${lead.headline || 'não informado'}; empresa: ${lead.company || 'não informada'}; cidade: ${lead.location || 'não informada'}.`,
  ].filter(Boolean).join('\n');
  const text = await chat(system, user);
  return text.replace(/^["']|["']$/g, '');
};

export type SearchPlan = { keywords: string; titles: string[]; locations: string[]; industries: string[]; linkedinUrl: string; googleUrl: string };

function linkedinSearchUrl(keywords: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}&origin=GLOBAL_SEARCH_HEADER`;
}

function googleXrayUrl(titles: string[], locations: string[], keywords: string): string {
  const parts = ['site:linkedin.com/in'];
  if (titles.length) parts.push(`(${titles.map((t) => `"${t}"`).join(' OR ')})`);
  if (locations.length) parts.push(`(${locations.map((l) => `"${l}"`).join(' OR ')})`);
  if (!titles.length && !locations.length) parts.push(keywords);
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(' '))}`;
}

/** Converte a descrição em linguagem natural num plano de busca (LinkedIn + Google X-ray). */
export async function planSearch(prompt: string): Promise<SearchPlan> {
  let plan = { keywords: prompt, titles: [] as string[], locations: [] as string[], industries: [] as string[] };
  if (aiConfigured()) {
    try {
      const raw = await chat(
        'Extraia filtros de busca de pessoas no LinkedIn. Responda apenas JSON: {"keywords":"...","titles":["..."],"locations":["..."],"industries":["..."]}. keywords: até 6 palavras para a busca do LinkedIn. titles: cargos em português e inglês.',
        prompt, 300,
      );
      const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      plan = {
        keywords: String(json.keywords || prompt).slice(0, 120),
        titles: Array.isArray(json.titles) ? json.titles.map(String).slice(0, 6) : [],
        locations: Array.isArray(json.locations) ? json.locations.map(String).slice(0, 4) : [],
        industries: Array.isArray(json.industries) ? json.industries.map(String).slice(0, 4) : [],
      };
    } catch { /* usa o texto original */ }
  }
  return { ...plan, linkedinUrl: linkedinSearchUrl(plan.keywords), googleUrl: googleXrayUrl(plan.titles, plan.locations, plan.keywords) };
}
