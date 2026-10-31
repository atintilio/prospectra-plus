import { describe, expect, it } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import { schema, type DB } from '@/db';
import { ensureDemo } from '@/lib/demo';
import { seedAgenda, type AgendaDemoCtx } from '@/lib/demo-agenda';
import { seedOrg, testDb } from './helpers';

/** Gerador determinístico (o mesmo do seed da demo: `rng(42)`). */
function rng(seed: number): () => number {
  let state = seed;
  return () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

/** Momento fixo: o seed precisa ser determinístico. */
const NOW = new Date('2026-11-02T12:00:00.000Z');

/** Org de demonstração com três leads em etapas diferentes. */
async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'Demonstração · Atlas Consultoria');
  await db.update(schema.orgs).set({ isDemo: true }).where(eq(schema.orgs.id, org.id));

  const [mariana, camila, fabio] = await db
    .insert(schema.leads)
    .values([
      {
        orgId: org.id,
        ownerId: user.id,
        fullName: 'Mariana Duarte',
        headline: 'CFO',
        company: 'Metalúrgica Vale do Sul',
        stage: 'meeting',
        linkedinUrl: 'https://www.linkedin.com/in/mariana-duarte-demo',
      },
      {
        orgId: org.id,
        ownerId: user.id,
        fullName: 'Camila Ferraz',
        headline: 'Head de Controladoria',
        company: 'Transportes Rota Sul',
        stage: 'replied',
        linkedinUrl: 'https://www.linkedin.com/in/camila-ferraz-demo',
      },
      {
        orgId: org.id,
        ownerId: user.id,
        fullName: 'Fábio Cardoso',
        headline: 'CFO',
        company: 'Construtora Horizonte',
        stage: 'connected',
        linkedinUrl: 'https://www.linkedin.com/in/fabio-cardoso-demo',
      },
    ])
    .returning();

  const ctx: AgendaDemoCtx = {
    orgId: org.id,
    userId: user.id,
    userIds: [user.id],
    leads: [mariana, camila, fabio].map((lead) => ({
      id: lead.id,
      fullName: lead.fullName,
      company: lead.company,
      headline: lead.headline,
      stage: lead.stage,
      ownerId: lead.ownerId,
    })),
    now: NOW,
    rand: rng(42),
  };

  return { db, org, user, ctx, mariana, camila, fabio };
}

async function total(db: DB, table: typeof schema.meetings | typeof schema.agendaEventTypes | typeof schema.agendaLinks | typeof schema.agendaBlackouts | typeof schema.agendaAvailability, orgId: string): Promise<number> {
  const rows = await db.select({ n: count() }).from(table).where(eq(table.orgId, orgId));
  return rows[0]?.n ?? 0;
}

describe('demo — agenda nativa', () => {
  it('cria tipos de reunião com disponibilidade, links, reservas e bloqueio', async () => {
    const { db, org, ctx } = await setup();

    const result = await seedAgenda(db, ctx);

    // 1) Tipos de reunião.
    const eventTypes = await db.select().from(schema.agendaEventTypes).where(eq(schema.agendaEventTypes.orgId, org.id));
    expect(eventTypes).toHaveLength(2);
    const diagnostico = eventTypes.find((row) => row.slug === 'diagnostico-tributario');
    const fechamento = eventTypes.find((row) => row.slug === 'reuniao-fechamento');
    expect(diagnostico).toBeTruthy();
    expect(fechamento).toBeTruthy();
    expect(diagnostico?.title).toBe('Diagnóstico tributário (30 min)');
    expect(diagnostico?.durationMin).toBe(30);
    expect(diagnostico?.timezone).toBe('America/Sao_Paulo');
    expect(diagnostico?.location).toContain('https://');
    expect(diagnostico?.reminderMinutesBefore).toBe(60);
    expect(diagnostico?.notifySeller).toBe(true);
    expect(diagnostico?.sendInvite).toBe(true);
    expect(fechamento?.durationMin).toBe(45);
    expect(fechamento?.requiresConfirmation).toBe(true);
    expect(result.eventTypes).toHaveLength(2);

    // 2) Disponibilidade semanal dos dois tipos (seg-sex 9h-12h e 14h-18h, sábado 9h-12h).
    const availability = await db.select().from(schema.agendaAvailability).where(eq(schema.agendaAvailability.orgId, org.id));
    expect(availability).toHaveLength(22);
    const doTipo = availability.filter((row) => row.eventTypeId === diagnostico?.id);
    expect(doTipo).toHaveLength(11);
    expect(doTipo.filter((row) => row.dayOfWeek >= 1 && row.dayOfWeek <= 5 && row.startMinute === 540 && row.endMinute === 720)).toHaveLength(5);
    expect(doTipo.filter((row) => row.dayOfWeek >= 1 && row.dayOfWeek <= 5 && row.startMinute === 840 && row.endMinute === 1080)).toHaveLength(5);
    expect(doTipo.filter((row) => row.dayOfWeek === 6 && row.startMinute === 540 && row.endMinute === 720)).toHaveLength(1);

    // 3) Links rastreados: um com lead (WhatsApp) e um genérico.
    const links = await db.select().from(schema.agendaLinks).where(eq(schema.agendaLinks.orgId, org.id));
    expect(links).toHaveLength(2);
    const linkLead = links.find((link) => link.channel === 'whatsapp');
    const linkGenerico = links.find((link) => link.channel === 'link');
    expect(linkLead?.leadId).toBeTruthy();
    expect(linkGenerico?.leadId).toBeNull();
    expect(linkLead?.token).toMatch(/^[a-f0-9]{64}$/);
    expect(linkGenerico?.token).toMatch(/^[a-f0-9]{64}$/);
    expect(linkLead?.eventTypeId).toBe(diagnostico?.id);
    expect(linkGenerico?.eventTypeId).toBe(fechamento?.id);

    // 4) Reservas: confirmada, aguardando aprovação e cancelada.
    const meetings = await db.select().from(schema.meetings).where(eq(schema.meetings.orgId, org.id));
    expect(meetings).toHaveLength(3);
    const confirmada = meetings.find((row) => row.status === 'confirmed');
    const aguardando = meetings.find((row) => row.status === 'requested');
    const cancelada = meetings.find((row) => row.status === 'cancelled');
    expect(confirmada).toBeTruthy();
    expect(aguardando).toBeTruthy();
    expect(cancelada).toBeTruthy();
    expect(confirmada?.source).toBe('agenda');
    expect(confirmada?.eventTypeId).toBe(diagnostico?.id);
    expect(confirmada?.linkId).toBe(linkLead?.id);
    expect(confirmada?.leadId).toBeTruthy();
    expect(confirmada?.attendeeName).toBeTruthy();
    expect(confirmada?.attendeeEmail).toMatch(/@demo\.invalid$/);
    expect(confirmada?.attendeePhone).toMatch(/^\+55519\d{8}$/);
    expect(confirmada?.cancelToken).toBeTruthy();
    expect(confirmada?.confirmedAt).toBeInstanceOf(Date);
    expect(confirmada?.scheduledAt).toBeInstanceOf(Date);
    expect(confirmada?.endTime).toBeInstanceOf(Date);
    expect(confirmada?.scheduledAt?.getTime()).toBeGreaterThan(NOW.getTime());
    expect(confirmada?.timezone).toBe('America/Sao_Paulo');
    expect(confirmada?.location).toBeTruthy();
    expect(confirmada?.note).toBeTruthy();
    expect(confirmada?.notes).toBeTruthy();
    expect(aguardando?.eventTypeId).toBe(fechamento?.id);
    expect(aguardando?.confirmedAt).toBeNull();
    expect(cancelada?.cancelledAt).toBeInstanceOf(Date);

    // 5) Bloqueio de agenda dentro do próximo mês.
    const blackouts = await db.select().from(schema.agendaBlackouts).where(eq(schema.agendaBlackouts.orgId, org.id));
    expect(blackouts).toHaveLength(1);
    expect(blackouts[0].reason).toContain('Congresso');
    expect(blackouts[0].startAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(blackouts[0].endAt.getTime()).toBeGreaterThan(blackouts[0].startAt.getTime());
    expect(blackouts[0].endAt.getTime()).toBeLessThan(NOW.getTime() + 31 * 86_400_000);
  });

  it('não toca a org de produção', async () => {
    const { db, ctx } = await setup();
    const outra = await seedOrg(db, 'Operação Real');

    await seedAgenda(db, ctx);

    expect(await total(db, schema.agendaEventTypes, outra.org.id)).toBe(0);
    expect(await total(db, schema.agendaLinks, outra.org.id)).toBe(0);
    expect(await total(db, schema.meetings, outra.org.id)).toBe(0);
    expect(await total(db, schema.agendaBlackouts, outra.org.id)).toBe(0);
    expect(await total(db, schema.agendaAvailability, outra.org.id)).toBe(0);
  });

  it('roda duas vezes sem duplicar nada', async () => {
    const { db, org, ctx } = await setup();

    const primeira = await seedAgenda(db, ctx);
    const segunda = await seedAgenda(db, ctx);

    expect(await total(db, schema.agendaEventTypes, org.id)).toBe(2);
    expect(await total(db, schema.agendaAvailability, org.id)).toBe(22);
    expect(await total(db, schema.agendaLinks, org.id)).toBe(2);
    expect(await total(db, schema.meetings, org.id)).toBe(3);
    expect(await total(db, schema.agendaBlackouts, org.id)).toBe(1);

    // Os mesmos ids: a segunda rodada reaproveita o que já existe.
    expect(segunda.eventTypes.map((row) => row.id)).toEqual(primeira.eventTypes.map((row) => row.id));
    expect(segunda.links.map((row) => row.id)).toEqual(primeira.links.map((row) => row.id));
    expect(segunda.links.map((row) => row.token)).toEqual(primeira.links.map((row) => row.token));
    expect(segunda.meetings.map((row) => row.id)).toEqual(primeira.meetings.map((row) => row.id));
    expect(segunda.blackouts.map((row) => row.id)).toEqual(primeira.blackouts.map((row) => row.id));

    // O token de cancelamento continua o mesmo (a reserva não foi recriada).
    const meetings = await db.select().from(schema.meetings).where(eq(schema.meetings.orgId, org.id));
    expect(meetings.filter((row) => row.status === 'confirmed')).toHaveLength(1);
  });

  it('mantém a reserva confirmada fora do índice de horário duplicado', async () => {
    const { db, org, ctx } = await setup();
    await seedAgenda(db, ctx);

    const meetings = await db
      .select()
      .from(schema.meetings)
      .where(and(eq(schema.meetings.orgId, org.id), eq(schema.meetings.status, 'confirmed')));
    expect(meetings).toHaveLength(1);
    const unica = meetings[0];
    expect(unica.scheduledAt).toBeInstanceOf(Date);
    expect(unica.endTime).toBeInstanceOf(Date);
    expect(unica.endTime?.getTime()).toBeGreaterThan(unica.scheduledAt?.getTime() ?? 0);
  });

  it('não duplica quando o seed roda de novo em outro dia (outro now e outro rand)', async () => {
    const { db, org, ctx } = await setup();

    await seedAgenda(db, ctx);
    const depois = await seedAgenda(db, { ...ctx, now: new Date('2026-12-20T09:30:00.000Z'), rand: rng(7) });

    expect(await total(db, schema.agendaEventTypes, org.id)).toBe(2);
    expect(await total(db, schema.agendaAvailability, org.id)).toBe(22);
    expect(await total(db, schema.agendaLinks, org.id)).toBe(2);
    expect(await total(db, schema.meetings, org.id)).toBe(3);
    expect(await total(db, schema.agendaBlackouts, org.id)).toBe(1);
    expect(depois.links.map((row) => row.id)).toHaveLength(2);
  });

  it('funciona sobre a org de demonstração real (ensureDemo)', async () => {
    const db = await testDb();
    const { user } = await seedOrg(db, 'Pessoa');
    const orgId = await ensureDemo(db, { id: user.id, name: user.name });

    const leads = await db.select().from(schema.leads).where(eq(schema.leads.orgId, orgId));
    const ctx: AgendaDemoCtx = {
      orgId,
      userId: user.id,
      userIds: [user.id],
      leads: leads.map((lead) => ({
        id: lead.id,
        fullName: lead.fullName,
        company: lead.company,
        headline: lead.headline,
        stage: lead.stage,
        ownerId: lead.ownerId,
      })),
      now: NOW,
      rand: rng(42),
    };

    await seedAgenda(db, ctx);
    await seedAgenda(db, ctx);

    expect(await total(db, schema.agendaEventTypes, orgId)).toBe(2);
    expect(await total(db, schema.agendaAvailability, orgId)).toBe(22);
    expect(await total(db, schema.agendaLinks, orgId)).toBe(2);
    expect(await total(db, schema.meetings, orgId)).toBe(3);
    expect(await total(db, schema.agendaBlackouts, orgId)).toBe(1);

    // As reservas apontam para leads de verdade da demo.
    const meetings = await db.select().from(schema.meetings).where(eq(schema.meetings.orgId, orgId));
    const leadIds = new Set(leads.map((lead) => lead.id));
    for (const meeting of meetings) {
      expect(meeting.leadId).toBeTruthy();
      expect(leadIds.has(meeting.leadId as string)).toBe(true);
    }
  });
});
