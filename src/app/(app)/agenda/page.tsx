import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { AGENDA_PUBLIC_URL, listAvailability, listBookings, listEventTypes } from '@/lib/agenda-booking';
import { PageHeader } from '@/components/ui';
import {
  AgendaView,
  type AgendaBookingView,
  type AgendaEventTypeView,
  type AgendaLeadView,
  type AgendaLinkView,
  type AgendaWindowView,
} from './agenda-view';

export const metadata = { title: 'Agenda' };
export const dynamic = 'force-dynamic';

/**
 * Tela interna da agenda: tipos de reunião, disponibilidade, link público e
 * reservas da operação. Tudo pelo módulo nativo (nada de cal.com).
 */
export default async function AgendaPage() {
  const ctx = await requireOrg();
  const db = await getDb();
  const scope = { orgId: ctx.org.id, userId: ctx.user.id };
  const now = new Date();

  const eventTypes = await listEventTypes(db, scope);
  const availability = await Promise.all(eventTypes.map((et) => listAvailability(db, scope, et.id)));
  const bookings = await listBookings(db, scope, {
    from: new Date(now.getTime() - 60 * 60 * 1000),
    to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    limit: 50,
  });

  const leadIds = [...new Set(bookings.map((b) => b.leadId).filter((id): id is string => Boolean(id)))];
  const bookingLeads = leadIds.length
    ? await db
        .select({ id: schema.leads.id, fullName: schema.leads.fullName })
        .from(schema.leads)
        .where(inArray(schema.leads.id, leadIds))
    : [];
  const leadNameById = new Map(bookingLeads.map((lead) => [lead.id, lead.fullName]));

  const eventTypeById = new Map(eventTypes.map((et) => [et.id, et]));
  const linkRows = await db
    .select({
      id: schema.agendaLinks.id,
      token: schema.agendaLinks.token,
      eventTypeId: schema.agendaLinks.eventTypeId,
      leadId: schema.agendaLinks.leadId,
      channel: schema.agendaLinks.channel,
      createdAt: schema.agendaLinks.createdAt,
      usedAt: schema.agendaLinks.usedAt,
    })
    .from(schema.agendaLinks)
    .where(eq(schema.agendaLinks.orgId, ctx.org.id))
    .orderBy(desc(schema.agendaLinks.createdAt))
    .limit(15);

  const linkLeadIds = [...new Set(linkRows.map((l) => l.leadId).filter((id): id is string => Boolean(id)))];
  const linkLeads = linkLeadIds.length
    ? await db
        .select({ id: schema.leads.id, fullName: schema.leads.fullName })
        .from(schema.leads)
        .where(inArray(schema.leads.id, linkLeadIds))
    : [];
  const linkLeadName = new Map(linkLeads.map((lead) => [lead.id, lead.fullName]));

  const sendLeads = await db
    .select({ id: schema.leads.id, fullName: schema.leads.fullName, phone: schema.leads.phone })
    .from(schema.leads)
    .where(and(eq(schema.leads.orgId, ctx.org.id), sql`${schema.leads.phone} <> ''`))
    .orderBy(desc(schema.leads.createdAt))
    .limit(200);

  const eventTypeViews: AgendaEventTypeView[] = eventTypes.map((et) => ({
    id: et.id,
    title: et.title,
    slug: et.slug,
    description: et.description,
    durationMin: et.durationMin,
    slotIntervalMin: et.slotIntervalMin,
    minNoticeMin: et.minNoticeMin,
    timezone: et.timezone,
    location: et.location,
    requiresConfirmation: et.requiresConfirmation,
    isActive: et.isActive,
    publicUrl: `${AGENDA_PUBLIC_URL}/agendamento/${et.slug}`,
  }));

  const availabilityByType: Record<string, AgendaWindowView[]> = {};
  eventTypes.forEach((et, index) => {
    availabilityByType[et.id] = availability[index] ?? [];
  });

  const bookingViews: AgendaBookingView[] = bookings.map((booking) => ({
    id: booking.id,
    when: formatWhen(booking.scheduledAt, booking.timezone),
    who: booking.attendeeName?.trim() || 'Participante',
    contact: [booking.attendeeEmail, booking.attendeePhone].filter(Boolean).join(' · '),
    leadId: booking.leadId,
    leadName: booking.leadId ? leadNameById.get(booking.leadId) ?? null : null,
    status: booking.status === 'confirmed' ? 'confirmed' : 'requested',
    source: booking.source,
  }));

  const linkViews: AgendaLinkView[] = linkRows.map((link) => ({
    id: link.id,
    url: `${AGENDA_PUBLIC_URL}/agendamento/${eventTypeById.get(link.eventTypeId)?.slug ?? ''}?token=${link.token}`,
    eventTitle: eventTypeById.get(link.eventTypeId)?.title ?? 'Tipo de reunião',
    leadName: link.leadId ? linkLeadName.get(link.leadId) ?? null : null,
    channel: link.channel,
    createdAt: link.createdAt.toISOString(),
    used: Boolean(link.usedAt),
  }));

  const leadViews: AgendaLeadView[] = sendLeads.map((lead) => ({
    id: lead.id,
    fullName: lead.fullName,
    phone: lead.phone,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Agenda nativa"
        title="Agenda"
        subtitle="Crie seus tipos de reunião, defina os horários livres, gere o link que o lead recebe e acompanhe as reservas."
      />
      <AgendaView
        eventTypes={eventTypeViews}
        availability={availabilityByType}
        bookings={bookingViews}
        links={linkViews}
        leads={leadViews}
      />
    </>
  );
}

/** Data e hora em pt-BR, no fuso do tipo de reunião. */
function formatWhen(date: Date | null, timezone: string | null): string {
  if (!date) return 'Horário a definir';
  return date.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone?.trim() || 'America/Sao_Paulo',
  });
}
