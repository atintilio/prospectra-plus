import { requireActiveSession, requireSameOrigin } from '../../../_lib/access.js';
import { createBridgeDevice, loadBridgeStore, redactDevice, requestBody, saveBridgeStore } from '../../../_lib/bridge.js';
import { json, methodNotAllowed } from '../../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const context = await requireActiveSession(req, res);
  if (!context) return;
  try {
    if (req.method === 'GET') {
      const store = await loadBridgeStore();
      return json(res, 200, { ok: true, devices: store.devices.filter((device) => device.userId === context.user.id).map(redactDevice) });
    }
    if (req.method === 'POST') {
      if (!requireSameOrigin(req, res)) return;
      const body = requestBody(req);
      const created = await createBridgeDevice(context.user, typeof body.name === 'string' ? body.name : 'Abridge local');
      return json(res, 201, { ok: true, ...created, warning: 'Copie o token agora. Ele não será exibido novamente.' });
    }
    if (req.method === 'DELETE') {
      if (!requireSameOrigin(req, res)) return;
      const deviceId = typeof req.query?.deviceId === 'string' ? req.query.deviceId : '';
      const store = await loadBridgeStore();
      const device = store.devices.find((entry) => entry.id === deviceId && entry.userId === context.user.id);
      if (!device) return json(res, 404, { error: 'bridge_device_not_found' });
      device.active = false; device.updatedAt = new Date().toISOString();
      await saveBridgeStore(store);
      return json(res, 200, { ok: true });
    }
    return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return json(res, code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 503 : 500, { error: code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 'bridge_storage_not_configured' : 'bridge_devices_failed' });
  }
}
