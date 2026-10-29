import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { aiGenerator } from '@/lib/ai';
import { dayString, runScheduler } from '@/lib/cadence';
import { PageHeader } from '@/components/ui';
import { Queue } from './queue';
import { nextBusinessSlots } from '@/lib/scheduling';

export const metadata = { title: 'Fila do dia' };

export default async function FilaPage() {
  const ctx = await requireOrg();
  const db = await getDb();
  await runScheduler(db, { orgId: ctx.org.id, generate: aiGenerator });
  const today = dayString(new Date());
  const rows = await db.select({ a: schema.actions, lead: schema.leads, camp: { name: schema.campaigns.name } })
    .from(schema.actions)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.actions.leadId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.actions.campaignId))
    .where(and(eq(schema.actions.orgId, ctx.org.id), eq(schema.actions.userId, ctx.user.id), eq(schema.actions.status, 'pending'), lte(schema.actions.dueDate, today)))
    .orderBy(asc(schema.actions.dueDate), asc(schema.actions.createdAt)).limit(300);

  // respeita os limites diários da conta: convites/mensagens já feitos hoje
  const doneToday = await db.select({ type: schema.actions.type }).from(schema.actions)
    .where(and(eq(schema.actions.userId, ctx.user.id), eq(schema.actions.status, 'done'), eq(schema.actions.dueDate, today)));
  const invitesLeft = Math.max(0, ctx.user.dailyInvites - doneToday.filter((d) => d.type === 'invite').length);
  const messagesLeft = Math.max(0, ctx.user.dailyMessages - doneToday.filter((d) => d.type === 'message').length);

  const waiting = await db.select().from(schema.leads)
    .where(and(eq(schema.leads.orgId, ctx.org.id), eq(schema.leads.ownerId, ctx.user.id), eq(schema.leads.stage, 'invited')))
    .orderBy(desc(schema.leads.lastActivityAt)).limit(40);
  const connected = await db.select().from(schema.leads)
    .where(and(eq(schema.leads.orgId, ctx.org.id), eq(schema.leads.ownerId, ctx.user.id), eq(schema.leads.stage, 'connected')))
    .orderBy(desc(schema.leads.lastActivityAt)).limit(40);

  const meetingRows = await db.select({ m: schema.meetings, leadName: schema.leads.fullName })
    .from(schema.meetings).innerJoin(schema.leads, eq(schema.leads.id, schema.meetings.leadId))
    .where(and(eq(schema.meetings.orgId, ctx.org.id), eq(schema.meetings.userId, ctx.user.id), inArray(schema.meetings.status, ['requested', 'confirmed'])))
    .orderBy(asc(schema.meetings.createdAt)).limit(40);
  const meetings = meetingRows.map(({ m, leadName }) => ({ id: m.id, leadName, status: m.status as 'requested' | 'confirmed', schedulerUrl: m.schedulerUrl, scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null }));
  const suggestedMeetingSlots = nextBusinessSlots(new Date()).map((slot) => slot.toISOString());

  const items = rows.map(({ a, lead, camp }) => ({
    id: a.id, type: a.type, body: a.body, campaign: camp.name, overdue: a.dueDate < today,
    lead: { id: lead.id, fullName: lead.fullName, headline: lead.headline, company: lead.company, linkedinUrl: lead.linkedinUrl, phone: lead.phone },
  }));
  const slim = (l: typeof waiting[number]) => ({ id: l.id, fullName: l.fullName, headline: l.headline, company: l.company, linkedinUrl: l.linkedinUrl });

  return (
    <>
      <PageHeader eyebrow="Modo assistido" title="Fila do dia"
        subtitle={`O texto já vem pronto. Abra no LinkedIn, cole e marque como feito. Hoje ainda cabem ${invitesLeft} convites e ${messagesLeft} mensagens.`} />
      <Queue items={items} waiting={waiting.map(slim)} connected={connected.map(slim)} meetings={meetings} suggestedMeetingSlots={suggestedMeetingSlots} limits={{ invitesLeft, messagesLeft }} />
    </>
  );
}
