import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { completeAction, enrollLeads, markOutcome, runScheduler } from '@/lib/cadence';
import { seedOrg, testDb } from './helpers';

const steps: schema.CampaignStep[] = [
  { id: 's1', type: 'invite', delayDays: 0, condition: 'always', template: 'Oi {nome}, vi seu trabalho na {empresa}.', useAi: false },
  { id: 's2', type: 'message', delayDays: 1, condition: 'accepted', template: 'Obrigado por aceitar, {nome}!', useAi: false },
  { id: 's3', type: 'message', delayDays: 3, condition: 'always', template: 'Faz sentido conversarmos?', useAi: false },
];

async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db);
  const [camp] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'C1', status: 'active', steps }).returning();
  const [lead] = await db.insert(schema.leads).values({ orgId: org.id, linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana Souza', company: 'Acme' }).returning();
  return { db, org, user, camp, lead };
}

const day = (n: number) => new Date(Date.UTC(2026, 9, 15 + n, 13));

describe('motor da cadência', () => {
  it('gera convite personalizado, espera aceite e segue o fluxo', async () => {
    const { db, org, user, camp, lead } = await setup();
    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
    const r1 = await runScheduler(db, { now: day(0) });
    expect(r1.created).toBe(1);
    // idempotente
    expect((await runScheduler(db, { now: day(0) })).created).toBe(0);
    const [a1] = await db.select().from(schema.actions);
    expect(a1.type).toBe('invite');
    expect(a1.body).toBe('Oi Ana, vi seu trabalho na Acme.');
    await completeAction(db, org.id, user.id, a1.id, 'done', undefined, day(0));
    expect((await db.select().from(schema.leads))[0].stage).toBe('invited');

    // passo 2 exige aceite: fica aguardando
    await runScheduler(db, { now: day(2) });
    let [enr] = await db.select().from(schema.enrollments);
    expect(enr.state).toBe('waiting_accept');
    expect(await db.select().from(schema.actions)).toHaveLength(1);

    await markOutcome(db, org.id, user.id, lead.id, 'accepted', day(3));
    expect((await runScheduler(db, { now: day(3) })).created).toBe(1);
    const a2 = (await db.select().from(schema.actions).where(eq(schema.actions.stepIndex, 1)))[0];
    expect(a2.body).toBe('Obrigado por aceitar, Ana!');
    await completeAction(db, org.id, user.id, a2.id, 'done', undefined, day(3));

    // passo 3 só vence 3 dias depois
    expect((await runScheduler(db, { now: day(4) })).created).toBe(0);
    expect((await runScheduler(db, { now: day(6) })).created).toBe(1);
    const a3 = (await db.select().from(schema.actions).where(eq(schema.actions.stepIndex, 2)))[0];
    await completeAction(db, org.id, user.id, a3.id, 'done', undefined, day(6));
    [enr] = await db.select().from(schema.enrollments);
    expect(enr.state).toBe('done');
    const evs = await db.select().from(schema.events);
    expect(evs.map((e) => e.type).sort()).toEqual(['invite_accepted', 'invite_sent', 'message_sent', 'message_sent']);
  });

  it('resposta encerra a cadência e pula ações pendentes', async () => {
    const { db, org, user, camp, lead } = await setup();
    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
    await runScheduler(db, { now: day(0) });
    await markOutcome(db, org.id, user.id, lead.id, 'replied', day(1));
    const [a] = await db.select().from(schema.actions);
    expect(a.status).toBe('skipped');
    const [enr] = await db.select().from(schema.enrollments);
    expect(enr.state).toBe('stopped');
    expect((await db.select().from(schema.leads))[0].stage).toBe('replied');
  });

  it('não deixa o mesmo lead em duas cadências ativas nem campanha pausada gerar ações', async () => {
    const { db, org, user, camp, lead } = await setup();
    const [c2] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'C2', status: 'paused', steps }).returning();
    expect((await enrollLeads(db, org.id, camp.id, [lead.id])).added).toBe(1);
    expect((await enrollLeads(db, org.id, c2.id, [lead.id])).added).toBe(0);
    await db.update(schema.campaigns).set({ status: 'paused' }).where(eq(schema.campaigns.id, camp.id));
    expect((await runScheduler(db, { now: day(0) })).created).toBe(0);
  });

  it('isola parceiros: não conclui ação nem marca lead de outro parceiro', async () => {
    const { db, org, user, camp, lead } = await setup();
    const other = await seedOrg(db, 'Parceiro B');
    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
    await runScheduler(db, { now: day(0) });
    const [a] = await db.select().from(schema.actions);
    await expect(completeAction(db, other.org.id, other.user.id, a.id, 'done')).rejects.toThrow();
    await expect(markOutcome(db, other.org.id, other.user.id, lead.id, 'won')).rejects.toThrow();
    // inscrição cruzada é ignorada
    expect((await enrollLeads(db, other.org.id, camp.id, [lead.id])).added).toBe(0);
    const pending = await db.select().from(schema.actions).where(and(eq(schema.actions.status, 'pending')));
    expect(pending).toHaveLength(1);
  });
});


describe('canais automáticos (e-mail + WhatsApp)', () => {
  const multi: schema.CampaignStep[] = [
    { id: 'e1', type: 'email', delayDays: 0, condition: 'always', template: 'Olá {nome}, tudo bem?', subject: 'Oi {nome}', useAi: false },
    { id: 'w1', type: 'whatsapp', delayDays: 0, condition: 'always', template: 'Oi {nome}, posso te mandar um resumo?', useAi: false },
  ];

  async function setupMulti() {
    const db = await testDb();
    const { org, user } = await seedOrg(db);
    const [camp] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'Multi', status: 'active', steps: multi }).returning();
    const [lead] = await db.insert(schema.leads).values({ orgId: org.id, linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana Souza', company: 'Acme', email: 'ana@acme.com', phone: '+5511999998888' }).returning();
    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
    return { db, org, user };
  }

  it('envia pelos canais injetados, conclui a ação e avança a cadência', async () => {
    const { db, org } = await setupMulti();
    const emails: [string, string, string][] = [];
    const whats: [string, string][] = [];
    const sendEmail = async (to: string, subject: string, body: string) => { emails.push([to, subject, body]); };
    const sendWhatsapp = async (_s: { orgId: string; userId: string }, phone: string, text: string) => { whats.push([phone, text]); return { providerMessageId: 'wamid.1' }; };

    expect((await runScheduler(db, { now: day(0), sendEmail, sendWhatsapp })).created).toBe(1);
    expect(emails).toEqual([['ana@acme.com', 'Oi Ana', 'Olá Ana, tudo bem?']]);

    expect((await runScheduler(db, { now: day(0), sendEmail, sendWhatsapp })).created).toBe(1);
    expect(whats).toEqual([['5511999998888', 'Oi Ana, posso te mandar um resumo?']]);

    expect((await db.select().from(schema.actions)).every((a) => a.status === 'done')).toBe(true);
    expect((await db.select().from(schema.events)).map((e) => e.type).sort()).toEqual(['email_sent', 'whatsapp_sent']);
    expect((await db.select().from(schema.enrollments))[0].state).toBe('done');
  });

  it('falha de envio deixa a ação pendente, sem reenvio automático', async () => {
    const { db } = await setupMulti();
    const sendEmail = async () => { throw new Error('smtp down'); };
    await runScheduler(db, { now: day(0), sendEmail });
    const [a] = await db.select().from(schema.actions);
    expect(a.status).toBe('pending');
    expect(await db.select().from(schema.events)).toHaveLength(0);
    // sem reenvio: próxima execução não cria nova ação
    expect((await runScheduler(db, { now: day(1), sendEmail })).created).toBe(0);
  });
});

it('IA desligada na operação usa o texto base sem chamar o provedor', async () => {
 const {db,org,camp,lead}=await setup();
 await db.update(schema.orgs).set({aiEnabled:false}).where(eq(schema.orgs.id,org.id));
 await db.update(schema.campaigns).set({steps:[{...steps[0],useAi:true}]}).where(eq(schema.campaigns.id,camp.id));
 await enrollLeads(db,org.id,camp.id,[lead.id],day(0));
 let calls=0;
 await runScheduler(db,{now:day(0),generate:async()=>{calls++;return 'generated';}});
 expect(calls).toBe(0);expect((await db.select().from(schema.actions))[0].body).toBe('Oi Ana, vi seu trabalho na Acme.');
});
