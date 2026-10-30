import { getDb } from '@/db';
import { cancelPublic } from '@/lib/agenda-booking';
import { fail, ok } from '@/app/api/agenda/_http';
import { CANCEL_BODY } from '@/app/api/agenda/_schemas';

export const dynamic = 'force-dynamic';

/** Cancela uma reserva pelo token (sem sessão). */
export async function POST(req: Request) {
  const parsed = CANCEL_BODY.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail('Link de cancelamento inválido.', 400);
  }
  try {
    const db = await getDb();
    const result = await cancelPublic(db, { cancelToken: parsed.data.cancelToken });
    if (!result.ok) {
      const status = /já (foi )?cancelad|já cancelad/i.test(result.error) ? 409 : 404;
      return fail(result.error, status);
    }
    return ok({});
  } catch {
    return fail('Não foi possível cancelar a reserva.', 500);
  }
}
