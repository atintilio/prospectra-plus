import { createHash, timingSafeEqual } from 'node:crypto';
import { header, json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import { recordWhatsAppDelivery, recordWhatsAppReply } from '../../_lib/whatsapp-events.js';
import { loadAuthStore } from '../../_lib/db.js';
import { baileysSessionId } from '../../../integrations/baileys.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const expected = process.env.BAILEYS_WEBHOOK_SECRET?.trim() ?? '';
  const received = header(req, 'x-prospectra-webhook-secret') ?? '';
  if (!expected || Buffer.byteLength(expected) !== Buffer.byteLength(received) || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return json(res, 401, { error: 'baileys_webhook_unauthorized' });
  try {
    const body = parseBody(req);
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : 'legacy';
    const user = sessionId === 'legacy' ? undefined : (await loadAuthStore()).users.find((item) => item.active && item.workspaceMode === 'production' && baileysSessionId(item) === sessionId);
    if (sessionId !== 'legacy' && !user) return json(res, 200, { ok: true, ignored: true });
    if (body.type === 'message.status' && typeof body.providerMessageId === 'string' && ['sent', 'delivered', 'read'].includes(String(body.status))) {
      const matched = await recordWhatsAppDelivery(body.providerMessageId, body.status as 'sent' | 'delivered' | 'read', user);
      return json(res, 200, { ok: true, matched });
    }
    if (body.type !== 'message.received' || typeof body.from !== 'string' || !body.from.replace(/\D/g, '')) return json(res, 200, { ok: true, ignored: true });
    const eventId = createHash('sha256').update(`${sessionId}:${typeof body.messageId === 'string' ? body.messageId : JSON.stringify(body)}`).digest('hex');
    const accountIds = await recordWhatsAppReply({ user, eventId, from: body.from, text: typeof body.text === 'string' ? body.text : '', actor: 'Baileys Gateway' });
    return json(res, 200, { ok: true, paused: accountIds.length > 0 });
  } catch { return json(res, 500, { error: 'baileys_webhook_failed' }); }
}
