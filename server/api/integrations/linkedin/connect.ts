import { requireActiveSession, requireSameOrigin } from '../../_lib/access.js';
import { json, methodNotAllowed } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { linkedinOidcConfigured, readLinkedInProfile, removeLinkedInProfile } from '../../../integrations/linkedin-oidc.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'DELETE') return methodNotAllowed(res, ['GET', 'DELETE']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  if (context.user.workspaceMode === 'demo') return json(res, 403, { error: 'demo_external_actions_disabled' });
  if (req.method === 'DELETE' && !requireSameOrigin(req, res)) return;
  try {
    if (req.method === 'DELETE') {
      await removeLinkedInProfile(context.user.id);
      return json(res, 200, { status: 'disconnected' });
    }
    if (!linkedinOidcConfigured()) return json(res, 200, { status: 'configuration_required' });
    const profile = await readLinkedInProfile(context.user.id);
    return json(res, 200, profile ? { status: 'authenticated', profile } : { status: 'disconnected' });
  } catch { return json(res, 503, { error: 'linkedin_connection_unavailable' }); }
}
