import Link from 'next/link';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { getDb } from '@/db';
import { requireUser } from '@/lib/auth';
import { listBookings } from '@/lib/agenda-booking';

/**
 * Card "Agenda" do painel (substitui o card do cal.com).
 *
 * Mostra as próximas reservas da operação e dá o atalho para /agenda, onde o
 * vendedor cria os tipos de reunião, define a disponibilidade e acompanha tudo.
 */
export async function AgendaCard() {
  const ctx = await requireUser();
  const org = ctx.org;

  if (!org) {
    return (
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarDays className="h-4 w-4 text-accent" /> Agenda
        </h2>
        <p className="mt-2 text-sm text-muted">
          A agenda agora é interna do Prospectra: cada operação cria seus tipos de reunião, define os
          horários disponíveis e acompanha as reservas. Escolha um parceiro no topo para ver as
          reservas dele.
        </p>
      </section>
    );
  }

  const db = await getDb();
  const now = new Date();
  const bookings = await listBookings(
    db,
    { orgId: org.id, userId: ctx.user.id },
    { from: new Date(now.getTime() - 60 * 60 * 1000), limit: 4 },
  );

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarDays className="h-4 w-4 text-accent" /> Agenda
        </h2>
        <Link href="/agenda" className="inline-flex items-center gap-1 text-sm font-medium text-accent">
          Abrir agenda <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {bookings.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Nenhuma reserva marcada até agora. Em <strong>/agenda</strong> você cria o tipo de reunião,
          define os horários e gera o link para enviar ao lead.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {bookings.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{b.attendeeName?.trim() || 'Participante'}</span>{' '}
                <span className="text-muted">· {formatWhen(b.scheduledAt, b.timezone)}</span>
              </span>
              <span className={`pill ${b.status === 'confirmed' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
                {b.status === 'confirmed' ? 'Confirmada' : 'Aguardando confirmação'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Data e hora em pt-BR, no fuso do tipo de reunião. */
function formatWhen(date: Date | null, timezone: string | null): string {
  if (!date) return 'a definir';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone?.trim() || 'America/Sao_Paulo',
  });
}
