import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Clock, MapPin, User } from 'lucide-react';
import { getDb } from '@/db';
import { listPublicEvent, listPublicSlots } from '@/lib/agenda-booking';
import { Logo } from '@/components/logo';
import { BookingView, type PublicAgendaEvent, type PublicSlot } from './booking-view';

/**
 * Página pública de marcação: `/agendamento/[slug]`.
 *
 * Fica FORA do grupo `(app)` — é a tela que o lead (fora do Prospectra) abre
 * pelo link que o vendedor enviou. Nenhuma sessão é exigida: o evento é
 * procurado pelo slug e os horários livres vêm da disponibilidade pública.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try {
    const { slug } = await params;
    const db = await getDb();
    const result = await listPublicEvent(db, slug);
    if (result.ok) {
      const description =
        result.eventType.description || `Agende uma ${result.eventType.title} com a equipe Prospectra.`;
      return { title: `${result.eventType.title} · Agendar`, description };
    }
  } catch {
    // Metadado é best-effort: a página trata o erro com mensagem amigável.
  }
  return { title: 'Agendar reunião' };
}

export default async function AgendaBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const rawToken = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const token = (rawToken ?? '').trim();

  let event: PublicAgendaEvent | null = null;
  let slots: PublicSlot[] = [];
  let loadError = false;

  try {
    const db = await getDb();
    const eventResult = await listPublicEvent(db, slug);
    if (eventResult.ok) {
      event = eventResult.eventType;
      const slotsResult = await listPublicSlots(db, slug);
      if (slotsResult.ok) slots = slotsResult.slots;
    }
  } catch {
    loadError = true;
  }

  // Evento inexistente (ou inativo): a página não quebra, explica o que houve.
  if (!event) {
    // Falha temporária de banco: explica e deixa o Lead tentar de novo.
    if (loadError) {
      return (
        <main className="min-h-dvh px-4 py-10">
          <div className="mx-auto w-full max-w-2xl">
            <header className="mb-8 flex items-center justify-between gap-3">
              <Logo />
              <span className="text-xs text-muted">Agendamento</span>
            </header>
            <section className="card p-6 text-center sm:p-8">
              <h1 className="text-2xl font-semibold tracking-tight">Não foi possível carregar a agenda</h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Tente novamente em alguns instantes. Se o problema continuar, peça um novo link com a nossa equipe.
              </p>
              <a className="btn-primary mt-6" href="/agendamento">Voltar para a agenda</a>
            </section>
          </div>
        </main>
      );
    }
    // Link inexistente ou evento desativado: resposta 404 de verdade.
    notFound();
  }

  const locationIsLink = event.location.startsWith('http');

  return (
    <main className="min-h-dvh px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6 flex items-center justify-between gap-3">
          <Logo />
          <span className="text-xs text-muted">Agendamento</span>
        </header>

        <section className="card p-5 sm:p-7">
          <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
          {event.description && (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{event.description}</p>
          )}
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <li className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-accent" /> {event.durationMin} minutos
            </li>
            <li className="flex items-center gap-1.5">
              <User className="h-4 w-4 text-accent" /> com {event.hostName}
            </li>
            {event.location && (
              <li className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-accent" />
                {locationIsLink ? (
                  <a className="text-accent hover:underline" href={event.location} target="_blank" rel="noreferrer">
                    {event.location}
                  </a>
                ) : (
                  event.location
                )}
              </li>
            )}
          </ul>
        </section>

        <BookingView key={event.slug} slug={event.slug} token={token} event={event} initialSlots={slots} />

        <p className="mt-8 text-center text-xs text-muted">
          Agenda do Prospectra — os horários são exibidos no fuso do evento.
        </p>
      </div>
    </main>
  );
}
