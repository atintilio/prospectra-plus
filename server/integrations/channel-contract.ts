import type { Channel, ChannelCapability } from '../../src/types';

/**
 * Contrato provider-neutral para conectores externos.
 *
 * O Prospectra não guarda cookies nem controla navegador. Cada provedor não oficial
 * deve expor uma base URL, credencial de servidor e endpoints de envio/webhook/status.
 * A implementação concreta entra em server/integrations/providers sem ser importada
 * pelo bundle do navegador.
 */
export interface ChannelMessage {
  channel: Channel;
  externalContactId: string;
  text: string;
  accountId: string;
  campaignId: string;
  approvedCopyRevision: number;
  evidenceIds: string[];
}

export interface DeliveryReceipt {
  providerMessageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'unknown';
  providerTimestamp?: string;
  rawStatus?: unknown;
}

export interface UnofficialChannelAdapter {
  readonly channel: Channel;
  readonly capability: ChannelCapability;
  health(): Promise<{ ok: boolean; detail: string }>;
  send(message: ChannelMessage): Promise<DeliveryReceipt>;
  verifyWebhook(payload: string, signature?: string): boolean;
  normalizeInbound(payload: unknown): { externalContactId: string; text: string; providerMessageId: string }[];
}

export interface ProviderConfig {
  baseUrl: string;
  apiKeyEnv: string;
  webhookSecretEnv: string;
  sendPath: string;
  healthPath: string;
}

export const unofficialProviderDefaults: Record<'whatsapp' | 'linkedin', ProviderConfig> = {
  whatsapp: {
    baseUrl: process.env.WHATSAPP_PROVIDER_BASE_URL ?? '',
    apiKeyEnv: 'WHATSAPP_PROVIDER_API_KEY',
    webhookSecretEnv: 'WHATSAPP_WEBHOOK_SECRET',
    sendPath: '/messages/send',
    healthPath: '/health',
  },
  linkedin: {
    baseUrl: process.env.LINKEDIN_PROVIDER_BASE_URL ?? '',
    apiKeyEnv: 'LINKEDIN_PROVIDER_API_KEY',
    webhookSecretEnv: 'LINKEDIN_WEBHOOK_SECRET',
    sendPath: '/messages/send',
    healthPath: '/health',
  },
};

export function providerIsConfigured(config: ProviderConfig, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(config.baseUrl && env[config.apiKeyEnv]);
}
