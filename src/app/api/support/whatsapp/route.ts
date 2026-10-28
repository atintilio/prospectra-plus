import { z } from 'zod';
import { getDb } from '@/db';
import { verifyHarveySignature } from '@/lib/harvey-operations';
import { intakeWhatsappMessage } from '@/lib/support';

export const dynamic = 'force-dynamic';

// WA-AKG entrega as mensagens de suporte aqui, assinadas com SUPPORT_WEBHOOK_SECRET
// (mesmo esquema HMAC do webhook do Harvey). Aceita os nomes de campo mais comuns do gateway.
const input = z.object({
  orgId: z.string().uuid(),
  phone: z.string().min(5),
  name: z.string().optional(),
  body: z.string().optional(),
  text: z.string().optional(),
  providerId: z.string().optional(),
  messageId: z.string().optional(),
}).transform((d) => ({ orgId: d.orgId, phone: d.phone, name: d.name, body: d.body ?? d.text ?? '', providerId: d.providerId ?? d.messageId ?? '' }));

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyHarveySignature(raw, req.headers.get('x-webhook-signature'), process.env.SUPPORT_WEBHOOK_SECRET)) {
    return new Response('unauthorized', { status: 401 });
  }
  let data: z.infer<typeof input>;
  try { data = input.parse(JSON.parse(raw)); } catch { return new Response('bad request', { status: 400 }); }
  if (!data.body || !data.providerId) return new Response('bad request', { status: 400 });
  try {
    return Response.json(await intakeWhatsappMessage(await getDb(), { orgId: data.orgId, phone: data.phone, name: data.name, body: data.body, providerId: data.providerId }));
  } catch {
    return new Response('invalid', { status: 400 });
  }
}
