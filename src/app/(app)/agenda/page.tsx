import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { meetingSchedulerUrl, publicMeetingUrl } from '@/lib/agenda';
import { PageHeader } from '@/components/ui';
import { AgendaView, type MeetingView } from './view';

export const metadata = { title: 'Agenda' };

function fmt(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(d);
}

export default async function AgendaPage() {
  const ctx = await requireOrg();
  const db = await getDb();
  const [rows, leads] = await Promise.all([
    db.select().from(schema.meetings).where(eq(schema.meetings.orgId, ctx.org.id)).orderBy(desc(schema.meetings.createdAt)).limit(100),
    db.select({ id: schema.leads.id, fullName: schema.leads.fullName }).from(schema.leads)
      .where(and(eq(schema.leads.orgId, ctx.org.id))).orderBy(desc(schema.leads.createdAt)).limit(200),
  ]);
  const meetings: MeetingView[] = rows.map((m) => ({
    id: m.id, title: m.title, requester: `${m.requesterName} · ${m.requesterEmail}`,
    slot: `${fmt(m.slot)} (${m.durationMin} min)`, status: m.status, icsState: m.icsState, icsError: m.icsError,
    publicUrl: publicMeetingUrl(m),
  }));
  return (
    <>
      <PageHeader title="Agenda" subtitle="Reuniões solicitadas, confirmadas e canceladas — com o link público e o estado do convite .ics." />
      <AgendaView meetings={meetings} schedulerUrl={meetingSchedulerUrl()} isDemo={ctx.org.isDemo}
        leads={leads.map((l) => ({ id: l.id, fullName: l.fullName }))} />
    </>
  );
}
