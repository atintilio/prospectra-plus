import { requireActiveSession, requireSameOrigin } from '../../_lib/access.js';
import { json, methodNotAllowed } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { activeWhatsAppProvider } from '../../../integrations/whatsapp-provider.js';
import { baileysConfigured, baileysQr, startBaileysSession } from '../../../integrations/baileys.js';
import { connectEvolutionInstance, evolutionConfig, evolutionConfigured, redactEvolutionPayload } from '../../../integrations/evolution.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  if (!requireSameOrigin(req, res)) return;
  const provider = activeWhatsAppProvider();
  if (context.user.workspaceMode === 'demo' || (provider === 'evolution' && (context.user.workspaceMode || context.user.role !== 'admin')) || (!context.user.workspaceMode && context.user.role !== 'admin')) return json(res, 403, { error: 'whatsapp_connection_out_of_scope' });
  if (provider === 'baileys') {
    if (!baileysConfigured()) return json(res, 503, { error: 'baileys_not_configured' });
    try {
      const started = await startBaileysSession(context.user);
      const qr = await baileysQr(context.user);
      return json(res, 200, { ok: true, provider, result: { ...started, ...qr } });
    } catch (error) {
      const status = Number((error as { status?: number }).status);
      return json(res, status >= 400 && status < 600 ? status : 502, { error: status === 503 ? 'baileys_capacity_reached' : 'baileys_connect_failed' });
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
