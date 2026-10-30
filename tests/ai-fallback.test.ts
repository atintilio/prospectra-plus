import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { aiComplete, aiFreeModelChain, aiModelChain, resetAiCooldowns } from '@/lib/ai';
import { generateCommercial, type CommercialInput } from '@/lib/harvey';

// Fallback de modelo: a z.ai devolve o erro no CORPO da resposta ({"error":{"code":"1113"}}),
// às vezes com HTTP 200. Só 1113 (sem saldo) e 1302 (rate limit) justificam trocar de modelo.

const ZAI_ENDPOINT = 'https://api.z.ai/api/paas/v4/chat/completions';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

type ProviderCall = {
  url: string;
  body: { model: string; temperature: number; max_tokens: number; messages: { role: string; content: string }[] };
};

const commercialInput: CommercialInput = {
  sellerName: 'Ana',
  strategy: 'Descobrir prioridade.',
  offers: [{ name: 'Diagnóstico', description: 'Conversa para mapear o processo comercial.' }],
  inbound: '',
  lead: { id: 'lead', orgId: 'org', ownerId: 'seller', fullName: 'Bruno Lima', company: 'Acme', headline: 'Diretor', stage: 'new' },
};
const commercialCtx = { userId: 'seller', status: 'active', orgId: 'org', orgActive: true, aiEnabled: true };
const commercialPlan = { offerIndex: 0, question: 'priority', intent: 'interested', topic: 'commercial', evidence: [{ field: 'company', quote: 'Acme' }] };

/** Mock do fetch do provedor: devolve a resposta conforme o modelo chamado. */
function mockProvider(handler: (call: ProviderCall) => Response): ProviderCall[] {
  const calls: ProviderCall[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
    const call: ProviderCall = { url: String(url), body: JSON.parse(String(init?.body)) as ProviderCall['body'] };
    calls.push(call);
    return handler(call);
  }));
  return calls;
}

const ok = (content: string) => Response.json({ choices: [{ message: { content } }] });
const zaiError = (code: string, message: string) => Response.json({ error: { code, message } });

beforeEach(() => {
  // o disjuntor guarda o estado por processo: limpa entre testes
  resetAiCooldowns();
  delete process.env.AI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.AI_BASE_URL;
  delete process.env.AI_MODEL;
  delete process.env.AI_FALLBACK_MODELS;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('lê o código do erro no corpo da resposta mesmo com HTTP 200', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  const calls = mockProvider((call) => (call.body.model === 'glm-4.7'
    ? zaiError('1113', 'Insufficient balance or no resource package. Please recharge.')
    : ok('resposta do modelo gratuito')));
  const text = await aiComplete('sistema', 'usuario');
  expect(text).toBe('resposta do modelo gratuito');
  expect(calls.map((call) => call.body.model)).toEqual(['glm-4.7', 'glm-4.7-flash']);
});

it('troca de modelo quando o provedor está sem saldo (1113)', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  const calls = mockProvider((call) => (call.body.model === 'glm-4.7'
    ? zaiError('1113', 'Insufficient balance or no resource package. Please recharge.')
    : ok('segunda tentativa')));
  expect(await aiComplete('sistema', 'usuario')).toBe('segunda tentativa');
  expect(calls.map((call) => call.body.model)).toEqual(['glm-4.7', 'glm-4.7-flash']);
});

it('troca de modelo quando o provedor entra em rate limit (1302)', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  const calls = mockProvider((call) => (call.body.model === 'glm-4.7'
    ? zaiError('1302', 'Rate limit reached for requests')
    : ok('depois do rate limit')));
  expect(await aiComplete('sistema', 'usuario')).toBe('depois do rate limit');
  expect(calls.map((call) => call.body.model)).toEqual(['glm-4.7', 'glm-4.7-flash']);
});

it('troca de modelo quando o serviço está sobrecarregado (1305)', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  const calls = mockProvider((call) => (call.body.model === 'glm-4.7'
    ? zaiError('1305', 'The service may be temporarily overloaded, please try again later')
    : ok('depois da sobrecarga')));
  expect(await aiComplete('sistema', 'usuario')).toBe('depois da sobrecarga');
  expect(calls.map((call) => call.body.model)).toEqual(['glm-4.7', 'glm-4.7-flash']);
});

it('não troca de modelo em erro de autenticação (401) e falha direto', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  const calls = mockProvider(() => Response.json({ error: { message: 'unauthorized' } }, { status: 401 }));
  await expect(aiComplete('sistema', 'usuario')).rejects.toThrow('AI_UNAVAILABLE_401');
  expect(calls).toHaveLength(1);
});

it('não troca de modelo em erro de permissão (403) e falha direto', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  const calls = mockProvider(() => Response.json({ error: { code: '1002', message: 'forbidden' } }, { status: 403 }));
  await expect(aiComplete('sistema', 'usuario')).rejects.toThrow('AI_UNAVAILABLE_1002');
  expect(calls).toHaveLength(1);
});

it('respeita a lista AI_FALLBACK_MODELS do ambiente, na ordem informada', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  vi.stubEnv('AI_FALLBACK_MODELS', 'glm-4.5-flash, glm-4.5-air');
  expect(aiModelChain()).toEqual(['glm-4.7', 'glm-4.5-flash', 'glm-4.5-air']);
  const calls = mockProvider((call) => (call.body.model === 'glm-4.7'
    ? zaiError('1113', 'Insufficient balance')
    : ok('modelo do fallback do ambiente')));
  expect(await aiComplete('sistema', 'usuario')).toBe('modelo do fallback do ambiente');
  expect(calls.map((call) => call.body.model)).toEqual(['glm-4.7', 'glm-4.5-flash']);
});

it('usa o padrão da z.ai quando não há lista no ambiente', () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  expect(aiModelChain()).toEqual(['glm-4.7', 'glm-4.7-flash', 'glm-4.5-flash']);
});

it('mantém o comportamento do OpenRouter: modelo configurado e openrouter/free', async () => {
  vi.stubEnv('AI_BASE_URL', OPENROUTER_ENDPOINT);
  vi.stubEnv('OPENROUTER_API_KEY', 'or-key');
  vi.stubEnv('AI_MODEL', 'qwen/qwen3-30b-a3b:free');
  expect(aiModelChain()).toEqual(['qwen/qwen3-30b-a3b:free', 'openrouter/free']);
  const calls = mockProvider((call) => (call.body.model === 'qwen/qwen3-30b-a3b:free'
    ? Response.json({ error: { message: 'rate limited' } }, { status: 429 })
    : ok('modelo gratuito do OpenRouter')));
  expect(await aiComplete('sistema', 'usuario')).toBe('modelo gratuito do OpenRouter');
  expect(calls.map((call) => call.body.model)).toEqual(['qwen/qwen3-30b-a3b:free', 'openrouter/free']);
});

it('quando todos os modelos falham, o erro final diz o que aconteceu', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  const calls = mockProvider(() => zaiError('1113', 'Insufficient balance or no resource package. Please recharge.'));
  await expect(aiComplete('sistema', 'usuario')).rejects.toThrow('AI_UNAVAILABLE_1113');
  expect(calls).toHaveLength(3);
});

it('sem chave configurada, a chamada falha com AI_NOT_CONFIGURED', async () => {
  await expect(aiComplete('sistema', 'usuario')).rejects.toThrow('AI_NOT_CONFIGURED');
});

it('o Harvey usa o provedor configurado (z.ai) com o modelo gratuito', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  const calls = mockProvider(() => ok(JSON.stringify(commercialPlan)));
  const result = await generateCommercial(commercialCtx, commercialInput);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(ZAI_ENDPOINT);
  expect(calls[0].body.model).toBe('glm-4.5-flash');
  expect(result.draft).toContain('Bruno Lima');
  expect(result.requiresReview).toBe(true);
});

it('o Harvey avisa e usa o gratuito quando o modelo configurado é pago', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const calls = mockProvider(() => ok(JSON.stringify(commercialPlan)));
  await generateCommercial(commercialCtx, commercialInput);
  expect(calls[0].body.model).toBe('glm-4.5-flash');
  expect(warn.mock.calls.some((call) => String(call[0]).includes('[harvey]'))).toBe(true);
});

it('o Harvey falha com AI_FREE_MODEL_REQUIRED quando o provedor não tem modelo gratuito', async () => {
  vi.stubEnv('AI_BASE_URL', 'https://api.exemplo.com/v1/chat/completions');
  vi.stubEnv('AI_API_KEY', 'any-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  expect(aiFreeModelChain()).toEqual([]);
  await expect(generateCommercial(commercialCtx, commercialInput)).rejects.toThrow('AI_FREE_MODEL_REQUIRED');
});

it('o Harvey falha fechado quando o provedor está sem saldo', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  mockProvider(() => zaiError('1113', 'Insufficient balance or no resource package. Please recharge.'));
  await expect(generateCommercial(commercialCtx, commercialInput)).rejects.toThrow('AI_UNAVAILABLE');
});

it('o Harvey mantém o prompt e o formato de saída intactos', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  const calls = mockProvider(() => ok(JSON.stringify(commercialPlan)));
  await generateCommercial(commercialCtx, commercialInput);
  const system = calls[0].body.messages[0];
  expect(system.role).toBe('system');
  expect(system.content).toContain('Responda somente JSON estrito');
  expect(system.content).toContain('offerIndex');
  expect(calls[0].body.messages[1].content).toContain('"sellerName":"Ana"');
});

it('apos uma falha de saldo, o modelo fica em pausa e nao e chamado de novo', async () => {
  vi.stubEnv('AI_BASE_URL', ZAI_ENDPOINT);
  vi.stubEnv('AI_API_KEY', 'zai-key');
  vi.stubEnv('AI_MODEL', 'glm-4.7');
  const calls = mockProvider((call) => (call.body.model === 'glm-4.7'
    ? zaiError('1113', 'Insufficient balance or no resource package. Please recharge.')
    : ok('resposta do fallback')));
  expect(await aiComplete('sistema', 'usuario')).toBe('resposta do fallback');
  expect(calls.map((call) => call.body.model)).toEqual(['glm-4.7', 'glm-4.7-flash']);
  // Segunda chamada: o glm-4.7 esta em pausa (sem saldo), vai direto ao fallback.
  const segunda = await aiComplete('sistema', 'usuario');
  expect(segunda).toBe('resposta do fallback');
  expect(calls.map((call) => call.body.model)).toEqual(['glm-4.7', 'glm-4.7-flash', 'glm-4.7-flash']);
});
