import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { completeAction, enrollLeads, runScheduler } from '@/lib/cadence';
import { seedOrg, testDb } from './helpers';

const steps: schema.CampaignStep[] = [
  { id: 'c1', type: 'call', delayDays: 0, condition: 'always', template: 'Ligar para {nome}: abertura, dor, próximo passo.', useAi: false },
];
const day = (n: number) => new Date(Date.UTC(2026, 9, 15 + n, 13));

describe('passo de ligação (assistida) na campanha', () => {
  it('cria a ação com roteiro e fica pendente (nunca liga sozinho); concluir registra call_made', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db);
    const [camp] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'Lig', status: 'active', steps }).returning();
    const [lead] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana', phone: '+5511999998888' }).returning();
    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));

    expect((await runScheduler(db, { now: day(0) })).created).toBe(1);
    const [action] = await db.select().from(schema.actions);
    expect(action.type).toBe('call');
    expect(action.body).toBe('Ligar para Ana: abertura, dor, próximo passo.');
    expect(action.status).toBe('pending'); // assistido: o humano liga e marca feito

    await completeAction(db, org.id, user.id, action.id, 'done', undefined, day(0));
    expect((await db.select().from(schema.events)).map((e) => e.type)).toContain('call_made');
  });
});
