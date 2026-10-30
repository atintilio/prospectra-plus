import { CalendarCheck, CalendarX2, Download } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { getMeetingByToken } from '@/lib/agenda';
import { PublicMeetingControls } from './controls';

export const metadata = { title: 'Reunião — Prospectra' };
export const dynamic = 'force-dynamic';

function fmt(d: Date, durationMin: number): string {
  const end = new Date(d.getTime() + durationMin * 60_000);
  const f = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
  return `${f.format(d)} – ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(end)}`;
}

export default async function PublicMeetingPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const db = await getDb();
  const m = await getMeetingByToken(db, publicId);
  if (!m) notFound();
  const badge = m.status === 'confirmed' ? 'Confirmada' : m.status === 'cancelled' ? 'Cancelada' : 'Aguardando confirmação';

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <div className="card p-8">
        <p className="text-sm font-medium text-accent">Prospectra · Agenda</p>
        <h1 className="mt-1 text-2xl font-semibold">{m.title}</h1>
        <p className="mt-2 text-sm text-muted">{fmt(m.slot, m.durationMin)}</p>
        <p className="mt-4 text-sm">Convidado: <strong>{m.requesterName}</strong> ({m.requesterEmail})</p>
        <p className="mt-1 text-sm text-muted">Status: <strong>{badge}</strong></p>
        <a href={`/agenda/${m.publicId}/ics`} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline">
          <Download className="h-4 w-4" /> Baixar convite (.ics)
        </a>
      </div>
      <PublicMeetingControls publicId={m.publicId} cancelled={m.status === 'cancelled'} />
    </main>
  );
}
