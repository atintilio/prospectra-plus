const DEFAULT_EVENTS = ['CONNECTION_UPDATE', 'QRCODE_UPDATED', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE'];

export type EvolutionConfig = { baseUrl: string; apiKey: string; instance: string; webhookSecret?: string; webhookUrl: string };
export type EvolutionReceipt = { providerMessageId?: string; status: 'queued' | 'sent' | 'unknown'; raw: unknown };

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`EVOLUTION_${name}_NOT_CONFIGURED`);
  return value;
}

export function evolutionConfigured() {
  return Boolean(process.env.EVOLUTION_API_URL?.trim() && process.env.EVOLUTION_API_KEY?.trim() && process.env.EVOLUTION_INSTANCE?.trim() && process.env.EVOLUTION_WEBHOOK_SECRET?.trim());
}

export function evolutionConfig(): EvolutionConfig {
  const baseUrl = required('EVOLUTION_API_URL').replace(/\/$/, '');
  const apiKey = required('EVOLUTION_API_KEY');
  const instance = required('EVOLUTION_INSTANCE');
  const webhookUrl = (process.env.EVOLUTION_WEBHOOK_URL?.trim() || 'https://prospectra.argusprime.com.br/api/integrations/whatsapp/webhook').replace(/\/$/, '');
  return { baseUrl, apiKey, instance, webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET?.trim(), webhookUrl };
}

async function evolutionRequest(path: string, init: RequestInit = {}) {
  const config = evolutionConfig();
  const response = await fetch(`${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', apikey: config.apiKey, ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`EVOLUTION_HTTP_${response.status}`);
    Object.assign(error, { status: response.status, body });
    throw error;
  }
  return body as Record<string, unknown>;
}

export function normalizeWhatsappNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw new Error('EVOLUTION_INVALID_NUMBER');
  return digits;
}

export function webhookConfig(config = evolutionConfig()) {
  return {
    enabled: true,
    url: config.webhookUrl,
    byEvents: false,
    base64: false,
    headers: config.webhookSecret ? { 'x-prospectra-webhook-secret': config.webhookSecret, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
    events: DEFAULT_EVENTS,
  };
}

export async function listEvolutionInstances() {
  return evolutionRequest('/instance/fetchInstances');
}

export async function createEvolutionInstance() {
  const config = evolutionConfig();
  return evolutionRequest('/instance/create', { method: 'POST', body: JSON.stringify({ instanceName: config.instance, token: config.apiKey, qrcode: true, integration: 'WHATSAPP-BAILEYS', webhook: webhookConfig(config) }) });
}

export async function connectEvolutionInstance() {
  const config = evolutionConfig();
  return evolutionRequest(`/instance/connect/${encodeURIComponent(config.instance)}`);
}

export async function connectionState() {
  const config = evolutionConfig();
  return evolutionRequest(`/instance/connectionState/${encodeURIComponent(config.instance)}`);
}

export async function setEvolutionWebhook() {
  const config = evolutionConfig();
  return evolutionRequest(`/webhook/set/${encodeURIComponent(config.instance)}`, { method: 'POST', body: JSON.stringify({ webhook: webhookConfig(config) }) });
}

export async function sendEvolutionText(input: { number: string; text: string; delay?: number }) : Promise<EvolutionReceipt> {
  const config = evolutionConfig();
  const number = normalizeWhatsappNumber(input.number);
  if (!input.text.trim() || input.text.length > 4096) throw new Error('EVOLUTION_INVALID_TEXT');
  const raw = await evolutionRequest(`/message/sendText/${encodeURIComponent(config.instance)}`, { method: 'POST', body: JSON.stringify({ number, text: input.text.trim(), delay: input.delay ?? 1200, linkPreview: false }) });
  const key = raw.key && typeof raw.key === 'object' ? raw.key as Record<string, unknown> : undefined;
  const providerMessageId = typeof key?.id === 'string' ? key.id : typeof raw.messageId === 'string' ? raw.messageId : undefined;
  return { providerMessageId, status: providerMessageId ? 'sent' : 'unknown', raw };
}
