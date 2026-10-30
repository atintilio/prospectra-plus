import { getDb } from '@/db';
import { z } from 'zod';
import { listBookings } from '@/lib/agenda-booking';
import { requireScope } from '@/app/api/agenda/_auth';
import { fail, fromError, ok } from '@/app/api/agenda/_http';
import { OPTIONAL_DATE, OPTIONAL_INT } from '@/app/api/agenda/_schemas';

export const dynamic = 'force-dynamic';

/** Lista as reservas da operação (período opcional). */
export async function GET(req: Request) {
  const auth = await requireScope();
  if (!auth.ok) return auth.response;
  const params = new URL(req.url).searchParams;
  const parsed = z.object({ from: OPTIONAL_DATE, to: OPTIONAL_DATE, limit: OPTIONAL_INT }).safeParse({
    from: params.get('from'),
    to: params.get('to'),
    limit: params.get('limit'),
  });
  if (!parsed.success) {
    return fail('Filtro inválido.', 400);
  }
  const opts: { from?: Date; to?: Date; limit?: number } = {};
  if (parsed.data.from) opts.from = new Date(parsed.data.from);
  if (parsed.data.to) opts.to = new Date(parsed.data.to);
  if (parsed.data.limit) opts.limit = parsed.data.limit;
  try {
    const db = await getDb();
    const bookings = await listBookings(db, auth.scope, opts);
    return ok({ bookings });
  } catch (err) {
    return fromError(err, 'Não foi possível carregar as reservas.', 500);
  }
}
