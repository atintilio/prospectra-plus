import { createHash, timingSafeEqual } from 'node:crypto';
import { header, json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { recordWhatsAppDelivery, recordWhatsAppReply } from '../../_lib/whatsapp-events.js';

function sameSecret(provided: string | undefined, expected: string | undefined) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
  if (!sameSecret(header(req, 'x-prospectra-webhook-secret'), secret)) return json(res, 401, { error: 'invalid_webhook_secret' });
  try {
    const body = parseBody(req);
    const instance = typeof body.instance === 'string' ? body.instance : '';
    if (!instance || instance !== process.env.EVOLUTION_INSTANCE?.trim()) return json(res, 403, { error: 'webhook_instance_out_of_scope' });
    const event = typeof body.event === 'string' ? body.event.toLowerCase().replace(/_/g, '.') : '';
    const rows = Array.isArray(body.data) ? body.data : [body.data];
    let processed = 0;
    for (const raw of rows.slice(0, 100)) {
      if (!raw || typeof raw !== 'object') continue;
      const data = raw as Record<string, any>;
      const key = data.key ?? {};
      const messageId = typeof key.id === 'string' ? key.id : typeof data.id === 'string' ? data.id : '';
      if (event === 'messages.upsert' && key.fromMe === false && typeof key.remoteJid === 'string' && key.remoteJid.endsWith('@s.whatsapp.net')) {
        const eventId = createHash('sha256').update(`${instance}:${messageId || JSON.stringify(data)}`).digest('hex');
        const text = data.message?.conversation ?? data.message?.extendedTextMessage?.text ?? '';
        const accounts = await recordWhatsAppReply({ eventId, from: key.remoteJid.split('@')[0], text: typeof text === 'string' ? text : '', actor: 'Evolution WhatsApp' });
        if (accounts.length) processed++;
      } else if (event === 'messages.update' && messageId) {
        const rawStatus = data.update?.status ?? data.status;
        const status = rawStatus === 4 || rawStatus === 5 || rawStatus === 'READ' || rawStatus === 'PLAYED' ? 'read' : rawStatus === 3 || rawStatus === 'DELIVERY_ACK' ? 'delivered' : rawStatus === 2 || rawStatus === 'SERVER_ACK' ? 'sent' : null;
        if (status && await recordWhatsAppDelivery(messageId, status)) processed++;
      }
    }
    return json(res, 200, { ok: true, accepted: true, processed });
  } catch { return json(res, 500, { error: 'evolution_webhook_failed' }); }
}
