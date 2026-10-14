import { requireActiveSession } from '../../_lib/access.js';
import { json, methodNotAllowed, publicOrigin } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { consumeLinkedInState, exchangeLinkedInCode, saveLinkedInProfile } from '../../../integrations/linkedin-oidc.js';

function query(req: ApiRequest, key: string): string {
  const value = req.query?.[key];
  return typeof value === 'string' ? value : '';
}

function finish(req: ApiRequest, res: ApiResponse, result: 'connected' | 'cancelled' | 'failed') {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', `${publicOrigin(req)}/linkedin-connected.html?result=${result}`);
  return res.status(302).end();
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  if (context.user.workspaceMode === 'demo') return json(res, 403, { error: 'demo_external_actions_disabled' });
  if (!consumeLinkedInState(req, res, context.user.id, query(req, 'state'))) return finish(req, res, 'failed');
  if (query(req, 'error')) return finish(req, res, 'cancelled');
  const code = query(req, 'code');
  if (!code || code.length > 2000) return finish(req, res, 'failed');
  try {
    const profile = await exchangeLinkedInCode(req, code);
    await saveLinkedInProfile(context.user.id, profile);
    return finish(req, res, 'connected');
  } catch { return finish(req, res, 'failed'); }
}
