import { requireBridgeDevice } from '../../../_lib/bridge.js';
import { json, methodNotAllowed, parseBody } from '../../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../../_lib/types.js';
import { saveBridgeStore } from '../../../_lib/bridge.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const context = await requireBridgeDevice(req, res);
  if (!context) return;
  try {
    const body = parseBody(req);
    const now = new Date().toISOString();
    context.device.lastSeenAt = now;
    context.device.updatedAt = now;
    context.device.lastStatus = typeof body.status === 'string' ? body.status.slice(0, 40) : 'online';
    context.device.lastPlatform = typeof body.platform === 'string' ? body.platform.slice(0, 40) : context.device.lastPlatform;
    await saveBridgeStore(context.store);
    return json(res, 200, { ok: true, lastSeenAt: now });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return json(res, code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 503 : 500, { error: code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 'bridge_storage_not_configured' : 'bridge_heartbeat_failed' });
  }
}
