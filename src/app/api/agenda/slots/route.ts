import { getDb } from '@/db';
import { listPublicSlots } from '@/lib/agenda-booking';
import { fail, ok, publicStatus } from '@/app/api/agenda/_http';
import { OPTIONAL_DATE, SLUG } from '@/app/api/agenda/_schemas';

export const dynamic = 'force-dynamic';

const DEFAULT_WINDOW_DAYS = 14;

/** Horários livres de um tipo de reunião (sem sessão). */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const slug = SLUG.safeParse(params.get('slug'));
  if (!slug.success) {
    return fail('Informe o código do evento (slug).', 400);
  }
  const from = OPTIONAL_DATE.safeParse(params.get('from'));
  const to = OPTIONAL_DATE.safeParse(params.get('to'));
  if (!from.success || !to.success) {
    return fail('Período inválido.', 400);
  }
  const start = from.data ? new Date(from.data) : new Date();
  const end = to.data ? new Date(to.data) : new Date(start.getTime() + DEFAULT_WINDOW_DAYS * 86_400_000);
  if (end.getTime() <= start.getTime()) {
    return fail('O fim do período precisa ser depois do início.', 400);
  }
  try {
    const db = await getDb();
    const result = await listPublicSlots(db, slug.data, { from: start, to: end });
    if (!result.ok) {
      return fail(result.error, publicStatus(result.error));
    }
    return ok({ slots: result.slots });
  } catch {
    return fail('Não foi possível carregar os horários.', 500);
  }
}
