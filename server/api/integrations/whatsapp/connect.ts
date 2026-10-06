import { requireOwner, requireSameOrigin } from '../../_lib/access.js';
import { json, methodNotAllowed } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { activeWhatsAppProvider } from '../../../integrations/whatsapp-provider.js';
import { baileysConfigured, baileysQr, startBaileysSession } from '../../../integrations/baileys.js';
import { connectEvolutionInstance, evolutionConfig, evolutionConfigured, redactEvolutionPayload } from '../../../integrations/evolution.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const context = await requireOwner(req, res);
  if (!context) return;
  if (!requireSameOrigin(req, res)) return;
  const provider = activeWhatsAppProvider();
  if (provider === 'baileys') {
    if (!baileysConfigured()) return json(res, 503, { error: 'baileys_not_configured' });
    try {
      const started = await startBaileysSession();
      const qr = await baileysQr();
      return json(res, 200, { ok: true, provider, result: { ...started, ...qr } });
    } catch (error) {
      const status = Number((error as { status?: number }).status);
      return json(res, status >= 400 && status < 600 ? status : 502, { error: 'baileys_connect_failed' });
    }
  }
  if (!evolutionConfigured()) return json(res, 503, { error: 'evolution_not_configured' });
  try {
    const result = await connectEvolutionInstance();
    return json(res, 200, { ok: true, provider, instance: evolutionConfig().instance, result: redactEvolutionPayload(result) });
  } catch (error) {
    const status = Number((error as { status?: number }).status);
    return json(res, status >= 400 && status < 600 ? status : 502, { error: 'evolution_connect_failed' });
  }
}
