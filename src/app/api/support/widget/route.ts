import { z } from 'zod';
import { getDb } from '@/db';
import { intakeWebMessage, originAllowed, publicConversationMessages } from '@/lib/support';

export const dynamic = 'force-dynamic';

const input = z.object({
  orgId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  name: z.string().max(120).optional(),
  email: z.string().max(200).optional(),
  body: z.string().min(1).max(4000),
});

function corsHeaders(origin: string | null): HeadersInit {
  // A liberação real é por operação (originAllowed); aqui só devolvemos o eco p/ o browser.
  return { 'Access-Control-Allow-Origin': origin ?? '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

// Leitura das mensagens da conversa (o widget faz polling para mostrar as respostas do agente).
export async function GET(req: Request) {
  const origin = req.headers.get('origin');
  const url = new URL(req.url);
  const orgId = z.string().uuid().safeParse(url.searchParams.get('orgId'));
  const conversationId = z.string().uuid().safeParse(url.searchParams.get('conversationId'));
  if (!orgId.success || !conversationId.success) return new Response('bad request', { status: 400, headers: corsHeaders(origin) });
  const db = await getDb();
  if (!(await originAllowed(db, orgId.data, origin))) return new Response('forbidden', { status: 403, headers: corsHeaders(origin) });
  const messages = await publicConversationMessages(db, orgId.data, conversationId.data);
  if (!messages) return new Response('not found', { status: 404, headers: corsHeaders(origin) });
  return Response.json({ messages }, { headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  let data: z.infer<typeof input>;
  try { data = input.parse(await req.json()); } catch { return new Response('bad request', { status: 400, headers: corsHeaders(origin) }); }
  try {
    const res = await intakeWebMessage(await getDb(), { orgId: data.orgId, origin, conversationId: data.conversationId, visitorName: data.name, visitorEmail: data.email, body: data.body });
    return Response.json(res, { headers: corsHeaders(origin) });
  } catch (e) {
    if (e instanceof Error && e.message === 'ORIGIN_NOT_ALLOWED') return new Response('forbidden', { status: 403, headers: corsHeaders(origin) });
    return new Response('invalid', { status: 400, headers: corsHeaders(origin) });
  }
}
