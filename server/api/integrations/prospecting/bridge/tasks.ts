import { requireActiveSession } from '../../../_lib/access.js';
import { loadBridgeStore, requestBody, safeTask, saveBridgeStore } from '../../../_lib/bridge.js';
import { json, methodNotAllowed } from '../../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const context = await requireActiveSession(req, res);
  if (!context) return;
  try {
    const store = await loadBridgeStore();
    if (req.method === 'GET') return json(res, 200, { ok: true, tasks: store.tasks.filter((task) => task.userId === context.user.id).slice(-100).reverse().map(({ userId: _userId, ...task }) => task) });
    if (req.method === 'POST') {
      const task = safeTask(requestBody(req), context.user.id);
      if (!task) return json(res, 400, { error: 'invalid_bridge_task' });
      if (task.deviceId && !store.devices.some((device) => device.id === task.deviceId && device.userId === context.user.id && device.active)) return json(res, 400, { error: 'bridge_device_not_found' });
      store.tasks.push(task); await saveBridgeStore(store);
      return json(res, 201, { ok: true, task: { ...task, userId: undefined } });
    }
    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return json(res, code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 503 : 500, { error: code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 'bridge_storage_not_configured' : 'bridge_tasks_failed' });
  }
}
