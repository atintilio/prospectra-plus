import { requireActiveSession, requireSameOrigin } from '../_lib/access.js';
import { json, methodNotAllowed, parseBody } from '../_lib/http.js';
import { loadWorkspaceState, mergeSafeWorkspaceState, saveWorkspaceState, synchronizeOrganization, visibleWorkspaceState } from '../_lib/workspace.js';
import type { ApiRequest, ApiResponse } from '../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') return methodNotAllowed(res, ['GET', 'PUT']);
  try {
    const context = await requireActiveSession(req, res);
    if (!context) return;
    const loaded = await loadWorkspaceState(context.user);
    const currentState = synchronizeOrganization(loaded.state, context.store, context.user);
    if (req.method === 'GET') return json(res, 200, { ok: true, source: 'private_blob', updatedAt: loaded.updatedAt, state: visibleWorkspaceState(currentState, context.user) });
    if (!requireSameOrigin(req, res)) return;
    if (context.user.role !== 'admin' && !context.user.workspaceMode) return json(res, 403, { error: 'owner_write_required' });
    const body = parseBody(req);
    const saved = await saveWorkspaceState(mergeSafeWorkspaceState(currentState, body.state), context.user);
    return json(res, 200, { ok: true, source: 'private_blob', updatedAt: saved.updatedAt, state: saved.state });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'workspace_failed';
    if (code === 'WORKSPACE_STORAGE_NOT_CONFIGURED') return json(res, 503, { error: 'workspace_storage_not_configured' });
    if (code === 'WORKSPACE_STATE_INVALID' || code === 'WORKSPACE_STORAGE_INVALID') return json(res, 422, { error: 'workspace_state_invalid' });
    return json(res, 500, { error: 'workspace_failed' });
  }
}
