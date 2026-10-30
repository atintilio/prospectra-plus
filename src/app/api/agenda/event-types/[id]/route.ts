import { getDb } from '@/db';
import { updateEventType } from '@/lib/agenda-booking';
import { requireScope } from '@/app/api/agenda/_auth';
import { fail, fromError, ok } from '@/app/api/agenda/_http';
import { EVENT_TYPE_PATCH, UUID } from '@/app/api/agenda/_schemas';

export const dynamic = 'force-dynamic';

/** Edita um tipo de reunião da operação. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireScope();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const parsedId = UUID.safeParse(id);
  if (!parsedId.success) {
    return fail('Identificador inválido.', 400);
  }
  const parsed = EVENT_TYPE_PATCH.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.', 400);
  }
  if (!Object.keys(parsed.data).length) {
    return fail('Informe ao menos um campo para salvar.', 400);
  }
  try {
    const db = await getDb();
    const eventType = await updateEventType(db, auth.scope, parsedId.data, parsed.data);
    return ok({ eventType });
  } catch (err) {
    return fromError(err, 'Não foi possível atualizar o tipo de reunião.');
  }
}
