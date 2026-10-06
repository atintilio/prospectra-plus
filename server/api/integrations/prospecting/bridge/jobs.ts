import { requireBridgeDevice } from '../../../_lib/bridge.js';
import { json, methodNotAllowed } from '../../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const context = await requireBridgeDevice(req, res);
  if (!context) return;
  try {
    const rawLimit = Number(req.query?.limit ?? 5);
    const limit = Number.isInteger(rawLimit) ? Math.max(1, Math.min(10, rawLimit)) : 5;
    const leaseCutoff = Date.now() - 10 * 60 * 1000;
    const queued = context.store.tasks.filter((task) => task.userId === context.user.id && (task.state === 'queued' || (task.state === 'leased' && task.leasedAt && Date.parse(task.leasedAt) < leaseCutoff)) && (!task.deviceId || task.deviceId === context.device.id)).slice(0, limit);
    const now = new Date().toISOString();
    for (const task of queued) { task.deviceId = context.device.id; task.state = 'leased'; task.leasedAt = now; }
    context.device.lastSeenAt = now; context.device.updatedAt = now; context.device.lastStatus = 'polling';
    await (await import('../../../_lib/bridge.js')).saveBridgeStore(context.store);
    return json(res, 200, { ok: true, jobs: queued.map(({ userId: _userId, ...task }) => task) });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return json(res, code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 503 : 500, { error: code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 'bridge_storage_not_configured' : 'bridge_jobs_failed' });
  }
}
