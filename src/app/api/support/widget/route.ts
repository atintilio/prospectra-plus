import { z } from 'zod';
import { getDb } from '@/db';
import { intakeWebMessage, originAllowed, publicConversationMessages } from '@/lib/support';
import { CSAT_MAX_COMMENT, csatPublicPayload, publicCsatConversation, recordCsat, shouldAskCsat } from '@/lib/support-csat';

export const dynamic = 'force-dynamic';

const input = z.object({
  orgId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  name: z.string().max(120).optional(),
  email: z.string().max(200).optional(),
  body: z.string().min(1).max(4000).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(), // nota de satisfação (1..5)
  comment: z.string().max(CSAT_MAX_COMMENT).optional(),
}).refine((d) => d.body != null || d.rating != null, { message: 'Informe a mensagem ou a nota.' });

function corsHeaders(origin: string | null): HeadersInit {
  // A liberação real é por operação (originAllowed); aqui só devolvemos o eco p/ o browser.
  return { 'Access-Control-Allow-Origin': origin ?? '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

// Nota enviada como texto puro ("4") quando o widget antigo não manda o campo `rating`.
function ratingFromBody(body: string | undefined): number | undefined {
  const text = (body ?? '').trim();
  return /^[1-5]$/.test(text) ? Number(text) : undefined;
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
  // pesquisa de satisfação: a conversa encerrada passa a pedir a nota (1..5).
  const conversation = await publicCsatConversation(db, orgId.data, conversationId.data);
  const csat = conversation ? { ...csatPublicPayload(conversation), askRating: shouldAskCsat(conversation, new Date()) } : null;
  return Response.json({ messages, csat }, { headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  let data: z.infer<typeof input>;
  try { data = input.parse(await req.json()); } catch { return new Response('bad request', { status: 400, headers: corsHeaders(origin) }); }
  const db = await getDb();
  // Conversa encerrada com pesquisa aberta: a resposta do widget passa a pedir a nota.
  if (data.conversationId) {
    const conversation = await publicCsatConversation(db, data.orgId, data.conversationId);
    if (conversation && shouldAskCsat(conversation, new Date())) {
      if (!(await originAllowed(db, data.orgId, origin))) return new Response('forbidden', { status: 403, headers: corsHeaders(origin) });
      const rating = data.rating ?? ratingFromBody(data.body);
      if (rating != null) {
        try {
          const saved = await recordCsat(conversation.id, rating, data.comment ?? null, db);
          return Response.json({ conversationId: conversation.id, csat: { ...csatPublicPayload(saved), askRating: false } }, { headers: corsHeaders(origin) });
        } catch (e) {
          if (e instanceof Error && e.message === 'avaliacao ja registrada') {
            return Response.json({ conversationId: conversation.id, csat: { ...csatPublicPayload(conversation), askRating: false } }, { status: 409, headers: corsHeaders(origin) });
          }
          return new Response('invalid', { status: 400, headers: corsHeaders(origin) });
        }
      }
      // Ainda sem nota: pede a nota e não reabre a conversa.
      return Response.json({ conversationId: conversation.id, csat: { ...csatPublicPayload(conversation), askRating: true } }, { headers: corsHeaders(origin) });
    }
  }
  if (!data.body) return new Response('bad request', { status: 400, headers: corsHeaders(origin) });
  try {
    const res = await intakeWebMessage(db, { orgId: data.orgId, origin, conversationId: data.conversationId, visitorName: data.name, visitorEmail: data.email, body: data.body });
    return Response.json(res, { headers: corsHeaders(origin) });
  } catch (e) {
    if (e instanceof Error && e.message === 'ORIGIN_NOT_ALLOWED') return new Response('forbidden', { status: 403, headers: corsHeaders(origin) });
    return new Response('invalid', { status: 400, headers: corsHeaders(origin) });
  }
}
