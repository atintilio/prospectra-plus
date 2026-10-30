import 'server-only';
import type { CampaignStep } from '@/db/schema';
import type { Generator } from './cadence';
import { fillTemplate } from './template';

// Provedor de IA genérico (API compatível com OpenAI): Z.AI/GLM, OpenRouter, etc.
// A configuração (endpoint, chave, modelos) é lida a cada chamada: o provedor pode mudar
// em runtime e o fallback por saldo/rate limit precisa refletir o estado real da conta.
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'qwen/qwen3-30b-a3b:free';
/** Modelos gratuitos do catálogo da Z.AI: funcionam mesmo com a conta sem saldo. */
const ZAI_FREE_MODELS = ['glm-4.5-flash'];
/** Rede de segurança da Z.AI: o glm-4.5-flash é o último e é gratuito (salva a operação). */
const ZAI_FALLBACK_MODELS = ['glm-4.7-flash', 'glm-4.5-flash'];
const OPENROUTER_FREE_MODEL = 'openrouter/free';
/** Máximo de modelos tentados em uma chamada. */
const MAX_ATTEMPTS = 3;
/** Código do provedor que significa "sem saldo / sem pacote de recursos". */
const ACCOUNT_ERROR_CODES = new Set(['1113']);
/** Códigos do provedor que significam "limite de requisições". */
const RATE_LIMIT_ERROR_CODES = new Set(['1302', '1305', '429']);

export type AiProvider = { endpoint: string; isOpenRouter: boolean; isZai: boolean; key?: string };

function aiKey(): string | undefined {
  return (process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY)?.trim() || undefined;
}

function hostname(endpoint: string): string {
  try {
    return new URL(endpoint).hostname.toLowerCase();
  } catch {
    return endpoint.toLowerCase();
  }
}

/** Provedor configurado no ambiente (lido a cada chamada). */
export function aiProvider(): AiProvider {
  const endpoint = process.env.AI_BASE_URL?.trim() || OPENROUTER_ENDPOINT;
  const host = hostname(endpoint);
  return {
    endpoint,
    isOpenRouter: host === 'openrouter.ai' || host.endsWith('.openrouter.ai'),
    isZai: host === 'z.ai' || host.endsWith('.z.ai') || host.endsWith('bigmodel.cn'),
    key: aiKey(),
  };
}

export function aiConfigured(): boolean {
  return Boolean(aiKey());
}

/** Modelo principal: o configurado no ambiente. */
function primaryModel(): string {
  return process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
}

/** Fallbacks declarados no ambiente (lista separada por vírgula). */
function envFallbacks(): string[] {
  return (process.env.AI_FALLBACK_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

/**
 * Cadeia de modelos de uma chamada: principal -> fallbacks do ambiente -> padrão do provedor.
 * Sem repetição e no máximo MAX_ATTEMPTS tentativas.
 */
export function aiModelChain(): string[] {
  const provider = aiProvider();
  const configured = envFallbacks();
  const defaults = provider.isOpenRouter ? [OPENROUTER_FREE_MODEL] : ZAI_FALLBACK_MODELS;
  const chain: string[] = [];
  for (const model of [primaryModel(), ...(configured.length ? configured : defaults)]) {
    if (!chain.includes(model)) chain.push(model);
  }
  return chain.slice(0, MAX_ATTEMPTS);
}

/**
 * Cadeia de modelos gratuitos do provedor atual — usada pelo Harvey, que nunca deve pagar.
 * Z.AI: glm-4.5-flash. OpenRouter: o configurado, se for `:free`, senão `openrouter/free`.
 */
export function aiFreeModelChain(): string[] {
  const provider = aiProvider();
  const configured = process.env.AI_MODEL?.trim() || '';
  if (provider.isOpenRouter) {
    if (configured && (configured === OPENROUTER_FREE_MODEL || configured.endsWith(':free'))) return [configured];
    return [OPENROUTER_FREE_MODEL];
  }
  if (provider.isZai) {
    return ZAI_FREE_MODELS.filter((model) => model === configured).length ? [configured] : ZAI_FREE_MODELS.slice();
  }
  return [];
}

/** Falha do provedor: o código vem do corpo da resposta (ex.: {"error":{"code":"1113"}}). */
class AiProviderError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly detail: string;

  constructor(code: string, detail: string, status: number, retryable: boolean) {
    super(`AI_UNAVAILABLE_${code}`);
    this.name = 'AiProviderError';
    this.code = code;
    this.detail = detail;
    this.status = status;
    this.retryable = retryable;
  }
}

/** Lê o código e a mensagem do erro no corpo da resposta (inclusive quando HTTP é 200). */
function readError(body: unknown): { code?: string; message?: string } {
  if (!body || typeof body !== 'object') return {};
  const root = body as Record<string, unknown>;
  const error = root.error;
  if (error && typeof error === 'object') {
    const detail = error as Record<string, unknown>;
    return {
      code: typeof detail.code === 'string' || typeof detail.code === 'number' ? String(detail.code) : undefined,
      message: typeof detail.message === 'string' ? detail.message : undefined,
    };
  }
  if (typeof error === 'string') return { message: error };
  return {
    code: typeof root.code === 'string' || typeof root.code === 'number' ? String(root.code) : undefined,
    message: typeof root.message === 'string' ? root.message : undefined,
  };
}

/** Só conta/saldo e rate limit justificam tentar outro modelo; 401/403/400 falham direto. */
function providerFailure(res: Response, body: unknown): AiProviderError {
  const { code, message } = readError(body);
  if (code) {
    const retryable = ACCOUNT_ERROR_CODES.has(code) || RATE_LIMIT_ERROR_CODES.has(code);
    return new AiProviderError(code, message || '', res.status, retryable);
  }
  if (!res.ok) {
    return new AiProviderError(String(res.status), message || '', res.status, res.status === 429);
  }
  return new AiProviderError('EMPTY_RESPONSE', message || '', res.status, false);
}

function networkFailure(error: unknown): AiProviderError {
  const name = error instanceof Error ? error.name : '';
  const code = name === 'TimeoutError' || name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
  return new AiProviderError(code, error instanceof Error ? error.message : '', 0, false);
}

async function callModel(
  provider: AiProvider,
  key: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const res = await fetch(provider.endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Prospectra' },
    body: JSON.stringify({
      model,
      // modelos com raciocínio forçado (ex.: GLM-4.7) gastam tokens pensando;
      // dá folga para a resposta não ser truncada e reduz a profundidade do raciocínio
      max_tokens: provider.isOpenRouter ? maxTokens : Math.max(maxTokens, 2048),
      temperature,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      ...(provider.isOpenRouter ? {} : { reasoning_effort: 'low' }),
    }),
    signal: AbortSignal.timeout(provider.isOpenRouter ? 25_000 : 45_000),
  });
  const body = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: unknown } }[]; error?: unknown };
  const raw = body.choices?.[0]?.message?.content;
  const text = typeof raw === 'string' ? raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim() : '';
  if (res.ok && text) return text;
  throw providerFailure(res, body);
}

/**
 * Chama o provedor com a cadeia de modelos: só troca de modelo em falha de conta (1113)
 * ou rate limit (1302/429). Se todos falharem, o erro diz o que houve (AI_UNAVAILABLE_1113...).
 */
async function chatWithModels(system: string, user: string, models: string[], maxTokens: number, temperature: number): Promise<string> {
  const provider = aiProvider();
  const key = provider.key;
  if (!key) throw new Error('AI_NOT_CONFIGURED');
  if (!models.length) throw new Error('AI_NO_MODEL');
  let firstFailure: AiProviderError | undefined;
  for (const model of models) {
    try {
      return await callModel(provider, key, model, system, user, maxTokens, temperature);
    } catch (error) {
      const failure = error instanceof AiProviderError ? error : networkFailure(error);
      if (!firstFailure) firstFailure = failure;
      console.warn(`[ai] modelo ${model} falhou (${failure.code}${failure.detail ? `: ${failure.detail}` : ''}); ${failure.retryable ? 'tentando o próximo modelo' : 'sem troca de modelo'}.`);
      if (!failure.retryable) throw failure;
    }
  }
  throw firstFailure ?? new Error('AI_UNAVAILABLE');
}

/** Chamada genérica à IA configurada (usa a cadeia de modelos com fallback). */
async function chat(system: string, user: string, maxTokens = 400): Promise<string> {
  return chatWithModels(system, user, aiModelChain(), maxTokens, 0.6);
}

/** Chamada genérica à IA configurada (usada pela descoberta de perfil DISC). */
export async function aiComplete(system: string, user: string, maxTokens = 400): Promise<string> {
  return chat(system, user, maxTokens);
}

/** Completa usando apenas modelo gratuito do provedor atual (Harvey: o custo é controlado de propósito). */
export async function aiCompleteFree(system: string, user: string, maxTokens = 700): Promise<string> {
  const models = aiFreeModelChain();
  if (!models.length) throw new Error('AI_FREE_MODEL_REQUIRED');
  return chatWithModels(system, user, models, maxTokens, 0);
}

const STEP_GOAL: Record<CampaignStep['type'], string> = {
  invite: 'nota de convite de conexão do LinkedIn, no máximo 280 caracteres, sem vender nada, tom de interesse genuíno',
  message: 'mensagem direta no LinkedIn após a conexão, 2 a 4 frases, uma pergunta aberta no final, sem parecer template',
  comment: 'comentário curto e relevante para um post recente do lead, 1 a 2 frases, sem pitch',
  react: '',
  email: 'e-mail de prospecção B2B curto e pessoal, 3 a 5 frases, uma pergunta ou CTA leve no final, sem parecer template',
  whatsapp: 'mensagem de WhatsApp curta e cordial, 2 a 3 frases, tom próximo e direto, uma pergunta no final',
  voice: 'roteiro curto para áudio de WhatsApp, 2 a 3 frases faladas de forma natural, tom próximo, sem soar roteirizado',
  image: 'legenda curta para uma imagem/informativo enviado no WhatsApp, 1 a 2 frases, tom próximo, sem soar template',
  call: 'roteiro curto para uma ligação de WhatsApp com o lead: abertura, 1 pergunta de descoberta e um próximo passo; tópicos falados, não um texto para ler',
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
