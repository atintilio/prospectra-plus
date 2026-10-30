import { getDb } from '@/db';
import { createEventType, listEventTypes } from '@/lib/agenda-booking';
import { requireScope } from '@/app/api/agenda/_auth';
import { fail, fromError, ok } from '@/app/api/agenda/_http';
import { EVENT_TYPE_INPUT } from '@/app/api/agenda/_schemas';

export const dynamic = 'force-dynamic';

/** Lista os tipos de reunião da operação. */
export async function GET() {
  const auth = await requireScope();
  if (!auth.ok) return auth.response;
  try {
    const db = await getDb();
    const eventTypes = await listEventTypes(db, auth.scope);
    return ok({ eventTypes });
  } catch (err) {
    return fromError(err, 'Não foi possível carregar os tipos de reunião.', 500);
  }
}

/** Cria um tipo de reunião. */
export async function POST(req: Request) {
  const auth = await requireScope();
  if (!auth.ok) return auth.response;
  const parsed = EVENT_TYPE_INPUT.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.', 400);
  }
  try {
    const db = await getDb();
    const eventType = await createEventType(db, auth.scope, parsed.data);
    return ok({ eventType }, 201);
  } catch (err) {
    return fromError(err, 'Não foi possível criar o tipo de reunião.');
  }
}
