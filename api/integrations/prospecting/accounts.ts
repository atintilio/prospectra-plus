import { requireActiveSession } from '../../_lib/access.js';
import { json, methodNotAllowed } from '../../_lib/http.js';
import { loadProspectingConnections } from '../../_lib/prospecting.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  try {
    const store = await loadProspectingConnections();
    return json(res, 200, { ok: true, connections: store.connections.filter((connection) => connection.userId === context.user.id).map(({ userId, ...connection }) => connection) });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return json(res, code === 'WORKSPACE_STORAGE_NOT_CONFIGURED' ? 503 : 500, { error: code === 'WORKSPACE_STORAGE_NOT_CONFIGURED' ? 'workspace_storage_not_configured' : 'prospecting_connections_failed' });
  }
}
