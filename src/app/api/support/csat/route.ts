import { z } from 'zod';
import { getDb } from '@/db';
import { requireOrg } from '@/lib/auth';
import { originAllowed } from '@/lib/support';
import {
  CSAT_MAX_COMMENT,
  csatPublicPayload,
  csatSummary,
  countPendingCsat,
  listCsatRows,
  publicCsatConversation,
  recordCsat,
  shouldAskCsat,
} from '@/lib/support-csat';

export const dynamic = 'force-dynamic';

/**
 * CSAT do atendimento.
 *  - POST: pública (é o widget do site do parceiro que registra a nota) — exige a origem
 *    liberada da operação e o id da conversa; nada de dado interno é devolvido.
 *  - GET: resumo da operação — exige sessão de agente (requireOrg).
 */

const input = z.object({
  orgId: z.string().uuid(),
  conversationId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(CSAT_MAX_COMMENT).optional(),
});

function corsHeaders(origin: string | null): HeadersInit {
  return { 'Access-Control-Allow-Origin': origin ?? '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

/** Registra a nota enviada pelo widget. */
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  let data: z.infer<typeof input>;
  try { data = input.parse(await req.json()); } catch { return new Response('bad request', { status: 400, headers: corsHeaders(origin) }); }
  const db = await getDb();
  // a origem precisa estar liberada na operação (mesma regra do widget)
  if (!(await originAllowed(db, data.orgId, origin))) return new Response('forbidden', { status: 403, headers: corsHeaders(origin) });
  const conversation = await publicCsatConversation(db, data.orgId, data.conversationId);
  if (!conversation) return new Response('not found', { status: 404, headers: corsHeaders(origin) });
  if (conversation.csatRating != null) {
    return Response.json({ error: 'avaliacao ja registrada', csat: csatPublicPayload(conversation) }, { status: 409, headers: corsHeaders(origin) });
  }
  if (!shouldAskCsat(conversation, new Date())) {
    return Response.json({ error: 'avaliacao fora da janela' }, { status: 409, headers: corsHeaders(origin) });
  }
  try {
    const saved = await recordCsat(conversation.id, data.rating, data.comment ?? null, db);
    return Response.json({ ok: true, csat: csatPublicPayload(saved) }, { headers: corsHeaders(origin) });
  } catch (e) {
    if (e instanceof Error && e.message === 'avaliacao ja registrada') {
      return Response.json({ error: e.message }, { status: 409, headers: corsHeaders(origin) });
    }
    return new Response('invalid', { status: 400, headers: corsHeaders(origin) });
  }
}

/** Resumo de CSAT da operação (média, respostas, distribuição, promoter/detractor). */
export async function GET() {
  const ctx = await requireOrg();
  const db = await getDb();
  const rows = await listCsatRows(db, ctx.org.id);
  const summary = csatSummary(rows);
  const pending = await countPendingCsat(db, ctx.org.id, new Date());
  return Response.json({ ...summary, pending });
}
