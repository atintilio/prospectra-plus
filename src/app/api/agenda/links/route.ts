import { getDb } from '@/db';
import { createLink } from '@/lib/agenda-booking';
import { requireScope } from '@/app/api/agenda/_auth';
import { fail, fromError, ok } from '@/app/api/agenda/_http';
import { LINK_BODY } from '@/app/api/agenda/_schemas';

export const dynamic = 'force-dynamic';

/** Gera um link público rastreado para um tipo de reunião. */
export async function POST(req: Request) {
  const auth = await requireScope();
  if (!auth.ok) return auth.response;
  const parsed = LINK_BODY.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.', 400);
  }
  try {
    const db = await getDb();
    const link = await createLink(db, auth.scope, parsed.data.eventTypeId, {
      leadId: parsed.data.leadId ?? null,
      channel: parsed.data.channel,
    });
    return ok({ token: link.token, url: link.url }, 201);
  } catch (err) {
    return fromError(err, 'Não foi possível gerar o link.');
  }
}
