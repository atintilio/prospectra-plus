import { requireActiveSession } from '../../_lib/access.js';
import { json, methodNotAllowed } from '../../_lib/http.js';
import { scrapeGraphHealth } from '../../../integrations/scrapegraph.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  const health = await scrapeGraphHealth();
  return json(res, 200, {
    ...health,
    // `ready` é a única flag que a UI deve usar para habilitar uma execução.
    ready: health.status === 'ready',
  });
}
