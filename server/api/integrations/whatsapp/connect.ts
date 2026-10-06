import { requireOwner } from '../../_lib/access.js';
import { json, methodNotAllowed } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { connectEvolutionInstance, evolutionConfig, evolutionConfigured } from '../../../integrations/evolution.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const context = await requireOwner(req, res);
  if (!context) return;
  if (!evolutionConfigured()) return json(res, 503, { error: 'evolution_not_configured' });
  try {
    const result = await connectEvolutionInstance();
    return json(res, 200, { ok: true, instance: evolutionConfig().instance, result });
  } catch (error) {
    const status = Number((error as { status?: number }).status);
    return json(res, status >= 400 && status < 600 ? status : 502, { error: 'evolution_connect_failed' });
  }
}
