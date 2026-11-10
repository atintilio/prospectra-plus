import { expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { loadCampaignContext } from '@/lib/campaign-context';
import { findCampaignLeads, previewCampaignDraft } from '@/lib/campaign-draft';
import { enrollLeads, runScheduler } from '@/lib/cadence';
import { seedOrg, testDb } from './helpers';

test('campaign drafts use fresh scoped context without sending or exposing private support notes', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db);
  const step: schema.CampaignStep = { id: 's1', type: 'message', delayDays: 0, condition: 'always', template: 'Olá {nome}', useAi: true };
  const [campaign] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'Campanha certa', status: 'active', steps: [step] }).returning();
  const [otherCampaign] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'Outra campanha', steps: [step] }).returning();
  const [lead] = await db.insert(schema.leads).values({ orgId: org.id, fullName: 'Ana', notes: 'Necessita integração fiscal', linkedinUrl: '' }).returning();
  const [otherLead] = await db.insert(schema.leads).values({ orgId: org.id, fullName: 'Bia', notes: 'Segredo de outro lead', linkedinUrl: '' }).returning();
  const [enrollment] = await db.insert(schema.enrollments).values({ orgId: org.id, campaignId: campaign.id, leadId: lead.id }).returning();
  const [past] = await db.insert(schema.enrollments).values({ orgId: org.id, campaignId: otherCampaign.id, leadId: lead.id, state: 'done' }).returning();
  await db.insert(schema.commercialProfiles).values({ orgId: org.id, userId: user.id, sellerName: 'Vendedor', companyName: 'Prospectra', sellerPhone: '', strategy: 'Tom consultivo', offers: [{ name: 'Oferta aprovada', description: 'Diagnóstico fiscal' }] });
  await db.insert(schema.actions).values([
    { orgId: org.id, campaignId: campaign.id, leadId: lead.id, enrollmentId: enrollment.id, userId: user.id, stepIndex: 0, type: 'message', body: 'Histórico certo', dueDate: '2026-11-10', status: 'done' },
    { orgId: org.id, campaignId: otherCampaign.id, leadId: lead.id, enrollmentId: past.id, userId: user.id, stepIndex: 0, type: 'message', body: 'Segredo de outra campanha', dueDate: '2026-11-10' },
  ]);
  const [conversation] = await db.insert(schema.supportConversations).values({ orgId: org.id, leadId: lead.id }).returning();
  await db.insert(schema.supportMessages).values([
    { conversationId: conversation.id, author: 'visitor', body: 'Pergunta pública recente' },
    { conversationId: conversation.id, author: 'agent', body: 'Nota privada sigilosa', private: true },
  ]);
  const actionsBefore = await db.select().from(schema.actions);
  const eventsBefore = await db.select().from(schema.events);
  let context = '';
  expect(await previewCampaignDraft(db, org.id, campaign.id, lead.id, 0, async args => { context = args.context ?? ''; return 'Prévia'; })).toBe('Prévia');
  for (const text of ['Necessita integração fiscal', 'Histórico certo', 'Oferta aprovada', 'Pergunta pública recente']) expect(context).toContain(text);
  for (const text of ['Segredo de outro lead', 'Segredo de outra campanha', 'Nota privada sigilosa']) expect(context).not.toContain(text);
  expect(await db.select().from(schema.actions)).toEqual(actionsBefore);
  expect(await db.select().from(schema.events)).toEqual(eventsBefore);
  await db.update(schema.leads).set({ notes: 'Contexto atualizado' }).where(eq(schema.leads.id, lead.id));
  expect(await loadCampaignContext(db, org.id, campaign.id, lead.id, user.id)).toContain('Contexto atualizado');
  const other = await seedOrg(db, 'Outra organização');
  expect(await findCampaignLeads(db, org.id, campaign.id, 'Ana')).toEqual([{ id: lead.id, fullName: 'Ana' }]);
  expect(await findCampaignLeads(db, org.id, campaign.id, 'Bia')).toEqual([]);
  expect(await findCampaignLeads(db, other.org.id, campaign.id, 'Ana')).toEqual([]);
  await expect(previewCampaignDraft(db, other.org.id, campaign.id, lead.id, 0, async () => '')).rejects.toThrow('CAMPAIGN_LEAD_NOT_FOUND');
  await expect(previewCampaignDraft(db, org.id, campaign.id, otherLead.id, 0, async () => '')).rejects.toThrow('CAMPAIGN_LEAD_NOT_FOUND');
  await expect(previewCampaignDraft(db, org.id, campaign.id, lead.id, 1, async () => '')).rejects.toThrow('INVALID_STEP');
});

test('scheduler passes seller and current lead context to automatic generation', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db);
  const step: schema.CampaignStep = { id: 's1', type: 'invite', delayDays: 0, condition: 'always', template: 'Olá {nome}', useAi: true };
  const [campaign] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'Contexto automático', status: 'active', steps: [step] }).returning();
  const [lead] = await db.insert(schema.leads).values({ orgId: org.id, fullName: 'Ana', linkedinUrl: 'https://www.linkedin.com/in/ana', notes: 'Prioridade fiscal' }).returning();
  const now = new Date('2026-11-10T13:00:00Z');
  await enrollLeads(db, org.id, campaign.id, [lead.id], now);
  let context = '';
  await runScheduler(db, { orgId: org.id, now, generate: async args => { context = args.context ?? ''; return 'Personalizado'; } });
  expect(context).toContain('Prioridade fiscal');
  expect(context).toContain(user.name);
  const [action] = await db.select().from(schema.actions);
  expect(action.body).toBe('Personalizado');
  expect(action.status).toBe('pending');
  expect(await previewCampaignDraft(db, org.id, campaign.id, lead.id, 0, async () => 'x'.repeat(350))).toHaveLength(300);
});
