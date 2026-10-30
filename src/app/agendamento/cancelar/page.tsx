import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { Logo } from '@/components/logo';
import { CancelBookingButton } from '../[slug]/booking-view';

/**
 * Cancelamento público: `/agendamento/cancelar?token=...`.
 *
 * O token vem da confirmação da reserva (`meetings.cancelToken`); não há sessão
 * nem senha. A página mostra os dados da reserva (evento, horário) e o botão que
 * chama `POST /api/agenda/cancel`. Token inválido vira mensagem amigável — nunca
 * erro bruto.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cancelar reunião',
  description: 'Cancele ou remarque a sua reunião agendada.',
};

/** Data/hora em pt-BR, no fuso da reunião. */
function formatMoment(value: Date | null, timezone: string): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone || 'America/Sao_Paulo',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString('pt-BR');
  }
}

type BookingRow = {
  status: string;
  attendeeName: string | null;
  scheduledAt: Date | null;
  endTime: Date | null;
  timezone: string;
  location: string;
  eventTitle: string | null;
  eventSlug: string | null;
};

export default async function CancelarPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawToken = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const token = (rawToken ?? '').trim();

  let booking: BookingRow | null = null;
  let loadError = false;

  if (token) {
    try {
      const db = await getDb();
      const [row] = await db
        .select({
          status: schema.meetings.status,
          attendeeName: schema.meetings.attendeeName,
          scheduledAt: schema.meetings.scheduledAt,
          endTime: schema.meetings.endTime,
          timezone: schema.meetings.timezone,
          location: schema.meetings.location,
          eventTitle: schema.agendaEventTypes.title,
          eventSlug: schema.agendaEventTypes.slug,
        })
        .from(schema.meetings)
        .leftJoin(schema.agendaEventTypes, eq(schema.agendaEventTypes.id, schema.meetings.eventTypeId))
        .where(eq(schema.meetings.cancelToken, token))
        .limit(1);
      booking = row ?? null;
    } catch {
      loadError = true;
    }
  }

  const when = booking ? formatMoment(booking.scheduledAt, booking.timezone) : '';
  const isCancelled = booking?.status === 'cancelled';

  return (
    <main className="min-h-dvh px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Logo />
          <span className="text-xs text-muted">Cancelamento</span>
        </header>

        <section className="card p-6 sm:p-8">
          {!token && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Link de cancelamento incompleto</h1>
              <p className="mt-2 text-sm text-muted">
                Para cancelar a sua reunião, abra o link de cancelamento que enviamos na confirmação. Se você
                perdeu o link, chame a nossa equipe — a gente cancela para você.
              </p>
            </>
          )}

          {token && loadError && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Não foi possível consultar a reserva</h1>
              <p className="mt-2 text-sm text-muted">
                O serviço de cancelamento não respondeu agora. Tente novamente em alguns instantes.
              </p>
            </>
          )}

          {token && !loadError && !booking && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Link de cancelamento inválido</h1>
              <p className="mt-2 text-sm text-muted">
                Este link não corresponde a nenhuma reserva — ele pode ter sido copiado por completo ou já ter
                sido usado. Se for o caso, chame a nossa equipe para cancelar a sua reunião.
              </p>
            </>
          )}

          {booking && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">
                {isCancelled ? 'Esta reunião já foi cancelada' : 'Cancelar reunião'}
              </h1>
              <p className="mt-2 text-sm text-muted">
                {isCancelled
                  ? 'O horário já está livre. Se quiser remarcar, é só escolher uma nova data.'
                  : 'Confira os dados abaixo e confirme o cancelamento. Não é preciso senha.'}
              </p>

              <dl className="mt-5 divide-y divide-border rounded-xl border border-border">
                <div className="px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-muted">Evento</dt>
                  <dd className="mt-0.5 text-sm font-medium">{booking.eventTitle ?? 'Reunião'}</dd>
                </div>
                <div className="px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-muted">Data e horário</dt>
                  <dd className="mt-0.5 text-sm font-medium">{when || 'A confirmar'}</dd>
                </div>
                {booking.attendeeName && (
                  <div className="px-4 py-3">
                    <dt className="text-xs uppercase tracking-wide text-muted">Participante</dt>
                    <dd className="mt-0.5 text-sm font-medium">{booking.attendeeName}</dd>
                  </div>
                )}
                {booking.location && (
                  <div className="px-4 py-3">
                    <dt className="text-xs uppercase tracking-wide text-muted">Local</dt>
                    <dd className="mt-0.5 break-all text-sm font-medium">{booking.location}</dd>
                  </div>
                )}
                <div className="px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-muted">Situação</dt>
                  <dd className="mt-0.5 text-sm font-medium">
                    {isCancelled
                      ? 'Cancelada'
                      : booking.status === 'requested'
                        ? 'Aguardando confirmação do vendedor'
                        : 'Confirmada'}
                  </dd>
                </div>
              </dl>

              {!isCancelled && (
                <div className="mt-6">
                  <CancelBookingButton token={token} />
                </div>
              )}

              {booking.eventSlug && (
                <a className="btn-ghost mt-6" href={`/agendamento/${booking.eventSlug}`}>
                  Remarcar em outro horário
                </a>
              )}
            </>
          )}
        </section>

        <p className="mt-8 text-center text-xs text-muted">
          Dúvidas? Fale com a gente pelo WhatsApp — a equipe Prospectra confirma o cancelamento.
        </p>
      </div>
    </main>
  );
}
