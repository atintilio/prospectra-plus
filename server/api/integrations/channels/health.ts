import { requireActiveSession } from '../../_lib/access.js';
import { json, methodNotAllowed } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { activeWhatsAppProvider } from '../../../integrations/whatsapp-provider.js';
import { baileysConfigured, baileysStatus } from '../../../integrations/baileys.js';
import { connectionState, evolutionConfig, evolutionConfigured } from '../../../integrations/evolution.js';

type ChannelHealth = { id: 'whatsapp' | 'linkedin'; status: 'connected' | 'not_configured' | 'failed'; capability: 'API autorizada' | 'API não oficial configurável' | 'Assistido' | 'Não configurado'; detail: string; checkedAt: string; provider?: string; latencyMs?: number; instance?: string };

async function checkBaileys(): Promise<ChannelHealth> {
  const checkedAt = new Date().toISOString();
  if (!baileysConfigured()) return { id: 'whatsapp', status: 'not_configured', capability: 'API não oficial configurável', detail: 'Configure BAILEYS_GATEWAY_URL e BAILEYS_GATEWAY_TOKEN no backend. O gateway precisa de Node/Docker persistente e volume data/auth.', checkedAt, provider: 'Baileys Gateway' };
  const started = Date.now();
  try {
    const payload = await baileysStatus();
    const state = String(payload.status ?? '').toLowerCase();
    const connected = payload.connected === true || state === 'connected';
    return { id: 'whatsapp', status: connected ? 'connected' : 'failed', capability: 'API não oficial configurável', detail: connected ? 'Baileys Gateway conectado e pronto para envio aprovado com opt-in.' : `Gateway acessível, mas a sessão está em estado “${state || 'desconhecido'}”. Gere o QR Code no painel Owner.`, checkedAt, provider: 'Baileys Gateway', instance: 'prospectra-baileys', latencyMs: Date.now() - started };
  } catch {
    return { id: 'whatsapp', status: 'failed', capability: 'API não oficial configurável', detail: 'Não foi possível alcançar ou autenticar o Baileys Gateway.', checkedAt, provider: 'Baileys Gateway', latencyMs: Date.now() - started };
  }
}

async function checkEvolution(): Promise<ChannelHealth> {
  const checkedAt = new Date().toISOString();
  if (!evolutionConfigured()) return { id: 'whatsapp', status: 'not_configured', capability: 'Não configurado', detail: 'Evolution está disponível apenas como fallback explícito. Configure EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE.', checkedAt, provider: 'Evolution API' };
  const started = Date.now();
  try {
    const config = evolutionConfig();
    const payload = await connectionState();
    const instancePayload = payload.instance && typeof payload.instance === 'object' ? payload.instance as Record<string, unknown> : {};
    const state = String(instancePayload.state ?? payload.state ?? payload.status ?? '').toLowerCase();
    const connected = state === 'open' || state === 'connected';
    return { id: 'whatsapp', status: connected ? 'connected' : 'failed', capability: 'API não oficial configurável', detail: connected ? 'Instância Evolution conectada e pronta para envio aprovado.' : `API acessível, mas a instância está em estado “${state || 'desconhecido'}”. Leia o QR Code no painel Owner.`, checkedAt, provider: 'Evolution API', instance: config.instance, latencyMs: Date.now() - started };
  } catch (error) {
    const status = Number((error as { status?: number }).status);
    return { id: 'whatsapp', status: 'failed', capability: 'API não oficial configurável', detail: status ? `Evolution API respondeu HTTP ${status}.` : 'Não foi possível alcançar ou autenticar a Evolution API.', checkedAt, provider: 'Evolution API', latencyMs: Date.now() - started };
  }
}

async function checkLinkedIn(): Promise<ChannelHealth> {
  const checkedAt = new Date().toISOString();
  const baseUrl = process.env.LINKEDIN_PROVIDER_BASE_URL?.trim();
  const apiKey = process.env.LINKEDIN_PROVIDER_API_KEY?.trim();
  if (!baseUrl || !apiKey) return { id: 'linkedin', status: 'not_configured', capability: 'Assistido', detail: 'O LinkedIn usa Abridge + linkout-scraper em Chrome local visível. A conta é conectada pelo operador no desktop; não há API cloud configurada.', checkedAt, provider: 'Abridge / linkout-scraper' };
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${process.env.LINKEDIN_PROVIDER_HEALTH_PATH ?? '/health'}`, { headers: { Authorization: `Bearer ${apiKey}`, apikey: apiKey }, signal: AbortSignal.timeout(8000) });
    return { id: 'linkedin', status: response.ok ? 'connected' : 'failed', capability: 'API autorizada', detail: response.ok ? 'Provider LinkedIn respondeu ao health check.' : `Provider LinkedIn respondeu HTTP ${response.status}.`, checkedAt, provider: 'LinkedIn/provider externo', latencyMs: Date.now() - started };
  } catch {
    return { id: 'linkedin', status: 'failed', capability: 'API autorizada', detail: 'Não foi possível alcançar o provider LinkedIn.', checkedAt, provider: 'LinkedIn/provider externo', latencyMs: Date.now() - started };
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  const whatsapp = activeWhatsAppProvider() === 'baileys' ? await checkBaileys() : await checkEvolution();
  const linkedin = await checkLinkedIn();
  return json(res, 200, { ok: true, channels: { whatsapp, linkedin }, checkedAt: new Date().toISOString() });
}
