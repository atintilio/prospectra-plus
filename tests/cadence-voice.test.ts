import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { enrollLeads, runScheduler } from '@/lib/cadence';
import { seedOrg, testDb } from './helpers';

const steps: schema.CampaignStep[] = [
  { id: 'v1', type: 'voice', delayDays: 0, condition: 'always', template: 'Oi {nome}, gravei um recado rápido pra você.', useAi: false },
];
const day = (n: number) => new Date(Date.UTC(2026, 9, 15 + n, 13));

describe('passo de voz na campanha', () => {
  it('enfileira a entrega de voz e deixa a ação pendente (entrega é do worker de voz)', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db);
    await db.insert(schema.voiceProfiles).values({ orgId: org.id, userId: user.id, externalId: 'abcdef01', engine: 'moss', consentAt: new Date() });
    const [camp] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'Voz', status: 'active', steps }).returning();
    const [lead] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana Souza', phone: '+5511999998888' }).returning();
    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));

    expect((await runScheduler(db, { now: day(0) })).created).toBe(1);
    const [action] = await db.select().from(schema.actions);
    expect(action.type).toBe('voice');
    expect(action.status).toBe('pending'); // só o worker de voz conclui, ao enviar o áudio

    const [job] = await db.select().from(schema.voiceJobs);
    expect(job.id).toBe(action.id); // idempotente por action.id
    expect(job).toMatchObject({ recipient: '5511999998888', text: 'Oi Ana, gravei um recado rápido pra você.', kind: 'audio', state: 'queued' });

    // re-rodar não duplica a ação nem o job de voz
    expect((await runScheduler(db, { now: day(0) })).created).toBe(0);
    expect(await db.select().from(schema.voiceJobs)).toHaveLength(1);
  });

  it('sem perfil de voz habilitado, fica assistida na Fila (nada enfileirado)', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db);
    const [camp] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'Voz', status: 'active', steps }).returning();
    const [lead] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/bo', fullName: 'Bo', phone: '+5511888887777' }).returning();
    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
    await runScheduler(db, { now: day(0) });
    expect((await db.select().from(schema.actions))[0].status).toBe('pending');
    expect(await db.select().from(schema.voiceJobs)).toHaveLength(0);
    void user;
  });
});
