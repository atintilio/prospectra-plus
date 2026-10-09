import { requireActiveSession, requireSameOrigin } from '../../_lib/access.js';
import { json, methodNotAllowed } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { linkedinLogin } from '../../../integrations/linkedin-login.js';
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method ?? '')) return methodNotAllowed(res, ['GET','POST','DELETE']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  res.setHeader('Cache-Control', 'no-store');
  if (context.user.workspaceMode === 'demo') return json(res, 403, { error: 'demo_external_actions_disabled' });
  if (req.method !== 'GET' && !requireSameOrigin(req, res)) return;
  try { return json(res, 200, await linkedinLogin(context.user.id, req.method as 'GET' | 'POST' | 'DELETE')); }
  catch { return json(res, 503, { status: 'unavailable', error: 'linkedin_login_unavailable' }); }
}
