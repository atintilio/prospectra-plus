import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { buildSupportReport } from '@/lib/support-reports';
import { seedOrg, testDb } from './helpers';

/**
 * Relatório de atendimento: a primeira resposta do agente vem de um agregado
 * `min(created_at)`. O agregador precisa devolver **Date** — com `sql` cru o
 * driver entrega string e o `.getTime()` estoura (a tela /relatorios quebrava
 * na demonstração).
 */
describe('relatório de atendimento', () => {
  it('calcula a primeira resposta com Date (sem quebrar em .getTime())', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Atendimento');
    const [conv] = await db.insert(schema.supportConversations).values({
      orgId: org.id,
      channel: 'web',
      audience: 'customer',
      status: 'closed',
      subject: 'Dúvida sobre nota',
      createdAt: new Date('2026-10-10T12:00:00Z'),
      slaDueAt: new Date('2026-10-10T13:00:00Z'),
      resolvedAt: new Date('2026-10-10T12:40:00Z'),
    }).returning();
    await db.insert(schema.supportMessages).values([
      { orgId: org.id, conversationId: conv.id, author: 'customer', body: 'Olá', private: false, createdAt: new Date('2026-10-10T12:01:00Z') },
      { orgId: org.id, conversationId: conv.id, author: 'agent', authorUserId: user.id, body: 'Resposta', private: false, createdAt: new Date('2026-10-10T12:05:00Z') },
      { orgId: org.id, conversationId: conv.id, author: 'agent', authorUserId: user.id, body: 'Nota interna', private: true, createdAt: new Date('2026-10-10T12:02:00Z') },
    ]);

    const report = await buildSupportReport(db, org.id, { now: new Date('2026-10-11T12:00:00Z') });
    expect(report.volume.total).toBe(1);
    expect(report.firstResponse.conversations).toBe(1);
    expect(report.firstResponse.averageMs).toBe(5 * 60_000);
    expect(report.sla.within).toBe(1);
    expect(report.sla.breached).toBe(0);
  });

  it('conversa sem resposta do agente não quebra o relatório', async () => {
    const db = await testDb();
    const { org } = await seedOrg(db, 'Atendimento 2');
    await db.insert(schema.supportConversations).values({
      orgId: org.id, channel: 'whatsapp', audience: 'customer', status: 'open',
      subject: 'Sem resposta', createdAt: new Date('2026-10-10T12:00:00Z'),
    });
    const report = await buildSupportReport(db, org.id, { now: new Date('2026-10-11T12:00:00Z') });
    expect(report.volume.total).toBe(1);
    expect(report.firstResponse.conversations).toBe(0);
  });

  it('o agregado da primeira resposta é Date, não string', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Atendimento 3');
    const [conv] = await db.insert(schema.supportConversations).values({
      orgId: org.id, channel: 'web', audience: 'customer', status: 'closed', subject: 'x',
      createdAt: new Date('2026-10-10T12:00:00Z'),
    }).returning();
    await db.insert(schema.supportMessages).values({
      orgId: org.id, conversationId: conv.id, author: 'agent', authorUserId: user.id, body: 'oi', private: false,
      createdAt: new Date('2026-10-10T12:05:00Z'),
    });
    const rows = await db.select({
      conversationId: schema.supportMessages.conversationId,
      at: (await import('drizzle-orm')).min(schema.supportMessages.createdAt),
    }).from(schema.supportMessages).where(and(
      eq(schema.supportMessages.conversationId, conv.id),
      eq(schema.supportMessages.author, 'agent'),
    )).groupBy(schema.supportMessages.conversationId);
    expect(rows[0].at).toBeInstanceOf(Date);
  });
});
