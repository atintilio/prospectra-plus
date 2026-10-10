import { BlobPreconditionFailedError } from '@vercel/blob';
import { loadBridgeStore, requireBridgeDevice, saveBridgeStore } from '../../../_lib/bridge.js';
import { json, methodNotAllowed } from '../../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const context = await requireBridgeDevice(req, res);
  if (!context) return;
  try {
    const rawLimit = Number(req.query?.limit ?? 5);
    const limit = Number.isInteger(rawLimit) ? Math.max(1, Math.min(10, rawLimit)) : 5;
    for (let attempt = 0; attempt < 8; attempt++) {
      const store = await loadBridgeStore();
      const device = store.devices.find((entry) => entry.id === context.device.id && entry.active && entry.userId === context.user.id);
      if (!device) return json(res, 401, { error: 'bridge_not_authenticated' });
      const leaseCutoff = Date.now() - 10 * 60 * 1000;
      // An uncertain send must never be dispatched again merely because its lease expired.
      const queued = store.tasks.filter((task) => task.userId === context.user.id && (task.state === 'queued' || (!task.requiresConfirmation && task.state === 'leased' && task.leasedAt && Date.parse(task.leasedAt) < leaseCutoff)) && (!task.deviceId || task.deviceId === device.id)).slice(0, limit);
      const now = new Date().toISOString();
      for (const task of queued) { task.deviceId = device.id; task.state = 'leased'; task.leasedAt = now; }
      device.lastSeenAt = now; device.updatedAt = now; device.lastStatus = 'polling';
      try {
        await saveBridgeStore(store);
        return json(res, 200, { ok: true, jobs: queued.map(({ userId: _userId, ...task }) => task) });
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) continue;
        throw error;
      }
    }
    return json(res, 409, { error: 'bridge_jobs_conflict', retryable: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return json(res, code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 503 : 500, { error: code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 'bridge_storage_not_configured' : 'bridge_jobs_failed' });
  }
}
