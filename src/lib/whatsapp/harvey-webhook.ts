import 'server-only';
import type { AkgGateway, Scope, WhatsAppStatus } from './akg';
import { sessionIdFor } from './akg';
import { sessionWebhookSecret } from './webhook-signing';

/** Reconcile the seller's inbound webhook after connecting or finding an existing session. */
export async function ensureHarveyWebhook(
  api: Pick<AkgGateway, 'configureWebhook'>,
  scope: Scope,
  status: WhatsAppStatus,
  action: 'connect' | 'status',
  config: { master?: string; origin?: string },
): Promise<WhatsAppStatus> {
  if (action !== 'connect' && status.state !== 'connected') return status;
  try {
    if (!config.master || !config.origin) throw new Error('WEBHOOK_NOT_CONFIGURED');
    const callback = new URL('/api/harvey/inbound', config.origin).toString();
    await api.configureWebhook(scope, callback, sessionWebhookSecret(config.master, sessionIdFor(scope)));
    return status;
  } catch {
    return {
      ...status,
      message: status.state === 'connected'
        ? 'WhatsApp conectado, mas o recebimento do Harvey não foi confirmado. Confira a configuração com o administrador.'
        : 'WhatsApp iniciado, mas o recebimento do Harvey não foi confirmado. Confira a configuração com o administrador.',
    };
  }
}
