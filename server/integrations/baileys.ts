import { createHash } from 'node:crypto';
import type { AuthUser } from '../api/_lib/types.js';
export type BaileysConfig = { baseUrl: string; apiToken: string };
export type TextReceipt = { providerMessageId: string; status: 'sent'; to: string };

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`BAILEYS_${name}_NOT_CONFIGURED`);
  return value;
}

export function baileysConfigured() {
  return Boolean(process.env.BAILEYS_GATEWAY_URL?.trim() && process.env.BAILEYS_GATEWAY_TOKEN?.trim());
}

export function baileysConfig(): BaileysConfig {
  return {
    baseUrl: required('BAILEYS_GATEWAY_URL').replace(/\/$/, ''),
    apiToken: required('BAILEYS_GATEWAY_TOKEN'),
  };
}

async function baileysRequest(path: string, init: RequestInit = {}) {
  const config = baileysConfig();
  const response = await fetch(`${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'x-prospectra-gateway-token': config.apiToken, ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`BAILEYS_HTTP_${response.status}`);
    Object.assign(error, { status: response.status, body });
    throw error;
  }
  return body as Record<string, unknown>;
}

export function baileysSessionId(user?: AuthUser): string {
  if (user?.workspaceMode === 'demo') throw new Error('BAILEYS_DEMO_DISABLED');
  return user?.workspaceMode === 'production' ? createHash('sha256').update(user.id).digest('hex') : 'legacy';
}

export async function baileysStatus(user?: AuthUser) {
  return baileysRequest(`/v1/sessions/${baileysSessionId(user)}/status`);
}

export async function startBaileysSession(user?: AuthUser) {
  return baileysRequest(`/v1/sessions/${baileysSessionId(user)}/start`, { method: 'POST', body: '{}' });
}

export async function baileysQr(user?: AuthUser) {
  return baileysRequest(`/v1/sessions/${baileysSessionId(user)}/qr`);
}

export function normalizeBaileysNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw new Error('BAILEYS_INVALID_NUMBER');
  return digits;
}

export async function sendBaileysText(input: { number: string; text: string; user?: AuthUser }): Promise<TextReceipt> {
  const number = normalizeBaileysNumber(input.number);
  if (!input.text.trim() || input.text.length > 4096) throw new Error('BAILEYS_INVALID_TEXT');
  const raw = await baileysRequest(`/v1/sessions/${baileysSessionId(input.user)}/messages/text`, { method: 'POST', body: JSON.stringify({ to: number, text: input.text.trim(), approved: true, optIn: true }) });
  const receipt = raw.receipt && typeof raw.receipt === 'object' ? raw.receipt as Record<string, unknown> : {};
  const providerMessageId = typeof receipt.providerMessageId === 'string' ? receipt.providerMessageId : '';
  if (!providerMessageId) throw new Error('BAILEYS_DELIVERY_UNKNOWN');
  return { providerMessageId, status: 'sent', to: number };
}
