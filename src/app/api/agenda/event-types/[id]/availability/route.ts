import { getDb } from '@/db';
import { listAvailability, setAvailability } from '@/lib/agenda-booking';
import { requireScope } from '@/app/api/agenda/_auth';
import { fail, fromError, ok } from '@/app/api/agenda/_http';
import { AVAILABILITY_BODY, UUID } from '@/app/api/agenda/_schemas';

export const dynamic = 'force-dynamic';

/** Substitui a disponibilidade semanal de um tipo de reunião. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireScope();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const parsedId = UUID.safeParse(id);
  if (!parsedId.success) {
    return fail('Identificador inválido.', 400);
  }
  const parsed = AVAILABILITY_BODY.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Janelas inválidas.', 400);
  }
  try {
    const db = await getDb();
    await setAvailability(db, auth.scope, parsedId.data, parsed.data.availability);
    const availability = await listAvailability(db, auth.scope, parsedId.data);
    return ok({ availability });
  } catch (err) {
    return fromError(err, 'Não foi possível salvar a disponibilidade.');
  }
}
