import { getDb } from '@/db';
import { bookPublic, type AgendaBookingCode } from '@/lib/agenda-booking';
import { fail, ok } from '@/app/api/agenda/_http';
import { BOOK_BODY } from '@/app/api/agenda/_schemas';

export const dynamic = 'force-dynamic';

/** Status HTTP por código de erro do agendamento. */
function statusForCode(code: AgendaBookingCode): number {
  if (code === 'not_found') return 404;
  if (code === 'slot_taken') return 409;
  return 400;
}

/** Agenda uma reunião (sem sessão). */
export async function POST(req: Request) {
  const parsed = BOOK_BODY.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.', 400);
  }
  const body = parsed.data;
  try {
    const db = await getDb();
    const result = await bookPublic(db, {
      slug: body.slug,
      token: body.token ?? null,
      start: new Date(body.start),
      attendeeName: body.attendeeName,
      attendeeEmail: body.attendeeEmail ?? null,
      attendeePhone: body.attendeePhone ?? null,
      notes: body.notes ?? undefined,
    });
    if (!result.ok) {
      return fail(result.error, statusForCode(result.code), result.code);
    }
    return ok({ meetingId: result.meeting.id, cancelUrl: result.cancelUrl }, 201);
  } catch {
    return fail('Não foi possível concluir o agendamento.', 500);
  }
}
