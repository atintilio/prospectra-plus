import { createHash } from 'node:crypto';
import { requireBridgeDevice } from '../../../_lib/bridge.js';
import { json, methodNotAllowed, parseBody } from '../../../_lib/http.js';
import { recordWhatsAppReply } from '../../../_lib/whatsapp-events.js';
import type { ApiRequest, ApiResponse } from '../../../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const context = await requireBridgeDevice(req, res);
  if (!context) return;
  try {
    const body = parseBody(req);
    if (body.type !== 'message.received' || typeof body.from !== 'string' || !body.from.replace(/\D/g, '')) return json(res, 400, { error: 'invalid_bridge_event' });
    const eventId = createHash('sha256').update(`${context.device.id}:${typeof body.messageId === 'string' ? body.messageId : JSON.stringify(body)}`).digest('hex');
    const accountIds = await recordWhatsAppReply({ user: context.user, eventId, from: body.from, text: typeof body.text === 'string' ? body.text : '', actor: `WhatsApp · ${context.device.name}` });
    return json(res, 200, { ok: true, matched: accountIds.length > 0, accountIds });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return json(res, code.includes('NOT_CONFIGURED') ? 503 : 500, { error: 'bridge_event_failed' });
  }
}
