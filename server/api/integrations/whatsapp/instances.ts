import { requireActiveSession, requireOwner, requireSameOrigin } from '../../_lib/access.js';
import { json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
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
    };
  }).filter(Boolean);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') {
    const context = await requireActiveSession(req, res);
    if (!context) return;
    if (!evolutionConfigured()) return json(res, 200, { ok: true, configured: false, instances: [] });
    try {
      const instances = await listEvolutionInstances();
      return json(res, 200, { ok: true, configured: true, instance: evolutionConfig().instance, instances: safeInstances(instances) });
    } catch {
      return json(res, 502, { error: 'evolution_unavailable' });
    }
  }
  if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  const context = await requireOwner(req, res);
  if (!context) return;
  if (!requireSameOrigin(req, res)) return;
  if (!evolutionConfigured()) return json(res, 503, { error: 'evolution_not_configured' });
  const body = parseBody(req);
  if (body.confirm !== true) return json(res, 400, { error: 'confirmation_required' });
  try {
    await createEvolutionInstance();
    try {
      await setEvolutionWebhook();
    } catch {
      return json(res, 502, { error: 'evolution_webhook_configuration_failed' });
    }
    return json(res, 200, { ok: true, instance: evolutionConfig().instance, webhook: 'configured' });
  } catch (error) {
    const status = Number((error as { status?: number }).status);
    return json(res, status >= 400 && status < 600 ? status : 502, { error: 'evolution_instance_failed' });
  }
}
