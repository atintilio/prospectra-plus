import { requireActiveSession } from '../../_lib/access.js';
import { json, methodNotAllowed } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';

type ChannelHealth = { id: 'whatsapp' | 'linkedin'; status: 'connected' | 'not_configured' | 'failed'; capability: 'API autorizada' | 'Assistido' | 'Não configurado'; detail: string; checkedAt: string; provider?: string; latencyMs?: number };

async function checkChannel(input: { id: ChannelHealth['id']; baseUrl?: string; apiKey?: string; healthPath: string; provider: string; assistedDetail: string; missingCapability: 'Assistido' | 'Não configurado' }): Promise<ChannelHealth> {
  const checkedAt = new Date().toISOString();
  if (!input.baseUrl || !input.apiKey) return { id: input.id, status: 'not_configured', capability: input.missingCapability, detail: input.assistedDetail, checkedAt, provider: input.provider };
  const started = Date.now();
  try {
    const base = input.baseUrl.replace(/\/$/, '');
    const response = await fetch(`${base}${input.healthPath.startsWith('/') ? input.healthPath : `/${input.healthPath}`}`, { headers: { Authorization: `Bearer ${input.apiKey}`, apikey: input.apiKey, 'x-api-key': input.apiKey }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { id: input.id, status: 'failed', capability: 'API autorizada', detail: `O provedor respondeu HTTP ${response.status}.`, checkedAt, provider: input.provider, latencyMs: Date.now() - started };
    return { id: input.id, status: 'connected', capability: 'API autorizada', detail: 'Health check técnico confirmado. O envio continua bloqueado até a validação de escopo, webhook e reconciliação.', checkedAt, provider: input.provider, latencyMs: Date.now() - started };
  } catch (error) {
    return { id: input.id, status: 'failed', capability: 'API autorizada', detail: error instanceof Error && error.name === 'TimeoutError' ? 'O health check excedeu 8 segundos.' : 'Não foi possível alcançar o provedor externo.', checkedAt, provider: input.provider, latencyMs: Date.now() - started };
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  const [whatsapp, linkedin] = await Promise.all([
    checkChannel({ id: 'whatsapp', baseUrl: process.env.WHATSAPP_PROVIDER_BASE_URL ?? process.env.EVOLUTION_API_URL, apiKey: process.env.WHATSAPP_PROVIDER_API_KEY ?? process.env.EVOLUTION_API_KEY, healthPath: process.env.WHATSAPP_PROVIDER_HEALTH_PATH ?? '/health', provider: 'Evolution API', assistedDetail: 'Nenhuma base URL/credencial foi configurada. O WhatsApp permanece em modo assistido.', missingCapability: 'Não configurado' }),
    checkChannel({ id: 'linkedin', baseUrl: process.env.LINKEDIN_PROVIDER_BASE_URL, apiKey: process.env.LINKEDIN_PROVIDER_API_KEY, healthPath: process.env.LINKEDIN_PROVIDER_HEALTH_PATH ?? '/health', provider: 'LinkedIn/provider externo', assistedDetail: 'Não há API autorizada configurada. O LinkedIn permanece em tarefa humana assistida.', missingCapability: 'Assistido' }),
  ]);
  return json(res, 200, { ok: true, channels: { whatsapp, linkedin }, checkedAt: new Date().toISOString() });
}
