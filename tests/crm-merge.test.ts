import { test, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import { schema, type DB } from '@/db';
import {
  addWidgetOrigin, intakeWebMessage, intakeWhatsappMessage, linkConversationToLead,
  openInternalTicket, listProductTickets, adminProductThread, adminReplyProduct, adminSetProductStatus,
} from '@/lib/support';

async function seedLead(db: DB, orgId: string, extra: Partial<typeof schema.leads.$inferInsert> = {}) {
  const [lead] = await db.insert(schema.leads).values({ orgId, linkedinUrl: `https://linkedin.com/in/${crypto.randomUUID()}`, fullName: 'Lead', ...extra }).returning();
  return lead;
}

test('conversa de suporte vincula ao lead por email (web) e por telefone (WhatsApp)', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'CRM A');
  const byEmail = await seedLead(db, a.org.id, { fullName: 'Ana', email: 'ana@cliente.com' });
  const byPhone = await seedLead(db, a.org.id, { fullName: 'Bia', phone: '5511988887777' });
  await addWidgetOrigin(db, a.org.id, 'https://site.com');

  const web = await intakeWebMessage(db, { orgId: a.org.id, origin: 'https://site.com', visitorEmail: 'ana@cliente.com', body: 'oi' });
  const [cw] = await db.select().from(schema.supportConversations).where(eq(schema.supportConversations.id, web.conversationId));
  expect(cw.leadId).toBe(byEmail.id);

  const wa = await intakeWhatsappMessage(db, { orgId: a.org.id, phone: '5511988887777', body: 'ajuda', providerId: 'wa1' });
  const [cwa] = await db.select().from(schema.supportConversations).where(eq(schema.supportConversations.id, wa.conversationId));
  expect(cwa.leadId).toBe(byPhone.id);

  // sem lead correspondente → fica sem vínculo
  const web2 = await intakeWebMessage(db, { orgId: a.org.id, origin: 'https://site.com', visitorEmail: 'novo@cliente.com', body: 'oi' });
  const [c2] = await db.select().from(schema.supportConversations).where(eq(schema.supportConversations.id, web2.conversationId));
  expect(c2.leadId).toBeNull();
});

test('linkConversationToLead preenche o contato ausente no lead', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'CRM B');
  const lead = await seedLead(db, a.org.id, { email: 'c@x.com' }); // sem telefone
  await addWidgetOrigin(db, a.org.id, 'https://s.com');
  const web = await intakeWebMessage(db, { orgId: a.org.id, origin: 'https://s.com', visitorEmail: 'c@x.com', body: 'oi' });
  // agora um vínculo que também traz o telefone preenche o campo vazio do lead
  await linkConversationToLead(db, a.org.id, web.conversationId, { email: 'c@x.com', phone: '5511900000000' });
  const [after] = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id));
  expect(after.phone).toBe('5511900000000');
});

test('chamado interno é roteado ao Argus: listado cross-org, respondido e fechado por admin', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Parceiro X');
  const t = await openInternalTicket(db, { orgId: a.org.id, userId: a.user.id, email: 'user@parceiro.com', name: 'Usuário' }, { subject: 'Erro de login', body: 'não entro' });

  const open = await listProductTickets(db, 'open');
  expect(open.map((r) => r.c.id)).toContain(t.conversationId);
  expect(open.find((r) => r.c.id === t.conversationId)!.orgName).toBe('Parceiro X');

  const thread = await adminProductThread(db, t.conversationId);
  expect(thread!.messages).toHaveLength(1);

  const { to } = await adminReplyProduct(db, a.user.id, t.conversationId, 'já resolvemos, tente de novo');
  expect(to).toBe('user@parceiro.com'); // resposta vai ao solicitante
  expect((await adminProductThread(db, t.conversationId))!.messages).toHaveLength(2);

  await adminSetProductStatus(db, t.conversationId, 'closed');
  expect((await listProductTickets(db, 'open')).map((r) => r.c.id)).not.toContain(t.conversationId);
});
