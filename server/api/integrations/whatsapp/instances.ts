import { requireActiveSession, requireSameOrigin } from '../../_lib/access.js';
import { json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { activeWhatsAppProvider } from '../../../integrations/whatsapp-provider.js';
import { baileysConfigured, baileysStatus, startBaileysSession } from '../../../integrations/baileys.js';
import { createEvolutionInstance, evolutionConfig, evolutionConfigured, listEvolutionInstances, setEvolutionWebhook } from '../../../integrations/evolution.js';

function safeInstances(value: unknown) {
  const list = Array.isArray(value) ? value : [];
  return list.map((entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Record<string, unknown>;
    return {
      instance: typeof item.instance === 'string' ? item.instance : typeof item.instanceName === 'string' ? item.instanceName : undefined,
      name: typeof item.name === 'string' ? item.name : undefined,
      status: typeof item.status === 'string' ? item.status : undefined,
      connectionStatus: typeof item.connectionStatus === 'string' ? item.connectionStatus : undefined,
      ownerJid: typeof item.ownerJid === 'string' ? item.ownerJid : undefined,
    };
  }).filter(Boolean);
}

async function baileysInstances(user: Parameters<typeof baileysStatus>[0]) {
  const payload = await baileysStatus(user);
  return [{ instance: 'prospectra-baileys', name: 'Baileys Gateway', status: typeof payload.status === 'string' ? payload.status : undefined, connectionStatus: typeof payload.status === 'string' ? payload.status : undefined, ownerJid: typeof payload.phone === 'string' ? payload.phone : undefined }];
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const provider = activeWhatsAppProvider();
  if (req.method === 'GET') {
    const context = await requireActiveSession(req, res);
    if (!context) return;
    if (context.user.workspaceMode === 'demo' || (provider === 'evolution' && context.user.workspaceMode)) return json(res, 403, { error: 'shared_gateway_access_disabled' });
    if (provider === 'baileys') {
      if (!baileysConfigured()) return json(res, 200, { ok: true, provider, configured: false, instances: [] });
      try { return json(res, 200, { ok: true, provider, configured: true, instances: await baileysInstances(context.user) }); }
      catch { return json(res, 502, { error: 'baileys_unavailable' }); }
    }
    if (!evolutionConfigured()) return json(res, 200, { ok: true, provider, configured: false, instances: [] });
    try {
      const instances = await listEvolutionInstances();
      return json(res, 200, { ok: true, provider, configured: true, instance: evolutionConfig().instance, instances: safeInstances(instances) });
    } catch { return json(res, 502, { error: 'evolution_unavailable' }); }
  }
  if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  if (context.user.workspaceMode === 'demo' || (provider === 'evolution' && (context.user.workspaceMode || context.user.role !== 'admin')) || (!context.user.workspaceMode && context.user.role !== 'admin')) return json(res, 403, { error: 'whatsapp_connection_out_of_scope' });
  if (!requireSameOrigin(req, res)) return;
  const body = parseBody(req);
  if (body.confirm !== true) return json(res, 400, { error: 'confirmation_required' });
  if (provider === 'baileys') {
    if (!baileysConfigured()) return json(res, 503, { error: 'baileys_not_configured' });
    try { return json(res, 200, { ok: true, provider, ...(await startBaileysSession(context.user)) }); }
    catch (error) { const capacity = Number((error as { status?: number }).status) === 503; return json(res, capacity ? 503 : 502, { error: capacity ? 'baileys_capacity_reached' : 'baileys_session_start_failed' }); }
  }
  if (!evolutionConfigured()) return json(res, 503, { error: 'evolution_not_configured' });
  try {
    await createEvolutionInstance();
    try { await setEvolutionWebhook(); }
    catch { return json(res, 502, { error: 'evolution_webhook_configuration_failed' }); }
    return json(res, 200, { ok: true, provider, instance: evolutionConfig().instance, webhook: 'configured' });
  } catch (error) {
    const status = Number((error as { status?: number }).status);
    return json(res, status >= 400 && status < 600 ? status : 502, { error: 'evolution_instance_failed' });
  }
}
