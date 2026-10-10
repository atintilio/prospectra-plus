import { requireActiveSession } from '../../_lib/access.js';
import { json, methodNotAllowed } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { activeWhatsAppProvider } from '../../../integrations/whatsapp-provider.js';
import { baileysConfigured, baileysQr } from '../../../integrations/baileys.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  if (context.user.workspaceMode === 'demo' || (!context.user.workspaceMode && context.user.role !== 'admin')) return json(res, 403, { error: 'whatsapp_connection_out_of_scope' });
  if (activeWhatsAppProvider() !== 'baileys' || !baileysConfigured()) return json(res, 503, { error: 'baileys_not_configured' });
  try { return json(res, 200, { ok: true, ...(await baileysQr(context.user)) }); }
  catch { return json(res, 502, { error: 'baileys_qr_unavailable' }); }
}
