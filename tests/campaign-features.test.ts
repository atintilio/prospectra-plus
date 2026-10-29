import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { enrollLeads, runScheduler } from '@/lib/cadence';
import { campaignFeatures, stepTypeEnabled } from '@/lib/campaign-features';
import { seedOrg, testDb } from './helpers';

const day = (n: number) => new Date(Date.UTC(2026, 9, 15 + n, 13));

type Feature = 'imageEnabled' | 'callEnabled';

async function setup(type: 'image' | 'call', opts: { feature?: Feature; value?: boolean; active?: boolean } = {}) {
  const db = await testDb();
  const { org, user } = await seedOrg(db);
  const steps: schema.CampaignStep[] = [
    type === 'image'
      ? { id: 'g1', type: 'image', delayDays: 0, condition: 'always', template: 'Veja, {nome}', useAi: false, mediaUrl: 'https://cdn.exemplo.com/i.png' }
      : { id: 'g1', type: 'call', delayDays: 0, condition: 'always', template: 'Ligar para {nome}', useAi: false },
  ];
  const [camp] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'Gate', status: 'active', steps }).returning();
  const [lead] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana', phone: '+5511999998888' }).returning();
  await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
  const patch: Record<string, boolean> = {};
  if (opts.active !== undefined) patch.active = opts.active;
  if (opts.feature) patch[opts.feature] = opts.value ?? true;
  if (Object.keys(patch).length) await db.update(schema.orgs).set(patch).where(eq(schema.orgs.id, org.id));
  return { db, org, user, camp };
}

describe('recursos de campanha só existem depois de ativados na operação', () => {
  it('imagem desligada: o passo não age, não vira tarefa e nada é enviado', async () => {
    const { db, org } = await setup('image');
    let sends = 0;
    const result = await runScheduler(db, { now: day(0), sendMedia: async () => { sends++; return { providerMessageId: 'x' }; } });
    expect(result.created).toBe(0);
    expect(sends).toBe(0);
    expect(await db.select().from(schema.actions)).toHaveLength(0);
    // a cadência segue em frente: o passo pulado não trava a inscrição
    const [enr] = await db.select().from(schema.enrollments);
    expect(enr.state).toBe('done');
    expect(enr.stepIndex).toBe(1);
    expect(org.imageEnabled).toBe(false);
  });

  it('imagem desligada no meio da sequência: o passo pula e os seguintes rodam', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db);
    const [camp] = await db.insert(schema.campaigns).values({
      orgId: org.id, ownerId: user.id, name: 'Gate', status: 'active',
      steps: [
        { id: 'g1', type: 'image', delayDays: 0, condition: 'always', template: 'Veja', useAi: false, mediaUrl: 'https://cdn.exemplo.com/i.png' },
        { id: 'g2', type: 'whatsapp', delayDays: 0, condition: 'always', template: 'Oi {nome}', useAi: false },
      ],
    }).returning();
    const [lead] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana', phone: '+5511999998888' }).returning();
    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));

    // O passo de imagem (recurso desligado) é pulado: nada de ação, nada de envio.
    const first = await runScheduler(db, { now: day(0) });
    expect(first.created).toBe(0);
    expect(await db.select().from(schema.actions)).toHaveLength(0);
    // A cadência segue: o passo seguinte roda no ciclo seguinte, como todo passo da fila.
    const second = await runScheduler(db, { now: day(0) });
    expect(second.created).toBe(1);
    const [action] = await db.select().from(schema.actions);
    expect(action.type).toBe('whatsapp');
  });

  it('imagem ligada: o passo age de verdade', async () => {
    const { db, org } = await setup('image', { feature: 'imageEnabled', value: true });
    const sent: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } })) as typeof fetch;
    try {
      const result = await runScheduler(db, { now: day(0), sendMedia: async (_s, phone) => { sent.push(phone); return { providerMessageId: 'm1' }; } });
      expect(result.created).toBe(1);
    } finally { globalThis.fetch = realFetch; }
    expect(sent).toEqual(['5511999998888']);
    expect((await db.select().from(schema.actions))[0].status).toBe('done');
  });

  it('ligação desligada: nenhuma tarefa é criada', async () => {
    const { db } = await setup('call');
    const result = await runScheduler(db, { now: day(0) });
    expect(result.created).toBe(0);
    expect(await db.select().from(schema.actions)).toHaveLength(0);
  });

  it('ligação ligada: a tarefa assistida é criada e fica pendente', async () => {
    const { db } = await setup('call', { feature: 'callEnabled', value: true });
    const result = await runScheduler(db, { now: day(0) });
    expect(result.created).toBe(1);
    const [action] = await db.select().from(schema.actions);
    expect(action.type).toBe('call');
    expect(action.status).toBe('pending');
  });

  it('operação inativa nunca tem recurso, mesmo com a chave ligada', async () => {
    const { db } = await setup('image', { feature: 'imageEnabled', value: true, active: false });
    const result = await runScheduler(db, { now: day(0) });
    expect(result.created).toBe(0);
    expect(await db.select().from(schema.actions)).toHaveLength(0);
  });
});

describe('campaignFeatures', () => {
  it('desligado por padrão e só liga com a chave da operação', () => {
    const off = campaignFeatures({ active: true, isDemo: false, imageEnabled: false, callEnabled: false });
    expect(off).toEqual({ image: false, call: false });
    const on = campaignFeatures({ active: true, isDemo: false, imageEnabled: true, callEnabled: true });
    expect(on).toEqual({ image: true, call: true });
  });

  it('operação inativa ou de demonstração não tem recurso', () => {
    expect(campaignFeatures({ active: false, isDemo: false, imageEnabled: true, callEnabled: true })).toEqual({ image: false, call: false });
    expect(campaignFeatures({ active: true, isDemo: true, imageEnabled: true, callEnabled: true })).toEqual({ image: false, call: false });
  });

  it('só os tipos com gate são condicionados', () => {
    const features = campaignFeatures({ active: true, isDemo: false, imageEnabled: false, callEnabled: false });
    expect(stepTypeEnabled(features, 'whatsapp')).toBe(true);
    expect(stepTypeEnabled(features, 'voice')).toBe(true);
    expect(stepTypeEnabled(features, 'email')).toBe(true);
    expect(stepTypeEnabled(features, 'image')).toBe(false);
    expect(stepTypeEnabled(features, 'call')).toBe(false);
  });
});
