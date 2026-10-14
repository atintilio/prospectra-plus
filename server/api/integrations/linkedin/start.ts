import { requireActiveSession } from '../../_lib/access.js';
import { json, methodNotAllowed } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { createLinkedInAuthorization } from '../../../integrations/linkedin-oidc.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  if (context.user.workspaceMode === 'demo') return json(res, 403, { error: 'demo_external_actions_disabled' });
  try {
    const url = createLinkedInAuthorization(req, res, context.user.id);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', url);
    return res.status(302).end();
  } catch {
    return json(res, 503, { error: 'linkedin_oidc_not_configured' });
  }
}
