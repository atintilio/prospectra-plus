import { getDb } from '@/db';
import { listPublicEvent } from '@/lib/agenda-booking';
import { fail, ok, publicStatus } from '@/app/api/agenda/_http';
import { SLUG } from '@/app/api/agenda/_schemas';

export const dynamic = 'force-dynamic';

/** Dados públicos de um tipo de reunião (sem sessão). */
export async function GET(req: Request) {
  const slug = SLUG.safeParse(new URL(req.url).searchParams.get('slug'));
  if (!slug.success) {
    return fail('Informe o código do evento (slug).', 400);
  }
  try {
    const db = await getDb();
    const result = await listPublicEvent(db, slug.data);
    if (!result.ok) {
      return fail(result.error, publicStatus(result.error));
    }
    return ok({ event: result.eventType });
  } catch {
    return fail('Não foi possível carregar o evento.', 500);
  }
}
