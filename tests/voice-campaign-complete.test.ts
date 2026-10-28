import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { enrollLeads, runScheduler } from '@/lib/cadence';
import { completeVoiceAction } from '@/lib/voice/campaign';
import { seedOrg, testDb } from './helpers';

const steps: schema.CampaignStep[] = [
  { id: 'v1', type: 'voice', delayDays: 0, condition: 'always', template: 'Oi {nome}, recado rápido.', useAi: false },
];

describe('conclusão da campanha pelo envio da voz', () => {
  it('conclui a ação, registra voice_sent e encerra a cadência quando a voz é enviada', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db);
    await db.insert(schema.voiceProfiles).values({ orgId: org.id, userId: user.id, externalId: 'abcdef01', engine: 'moss', consentAt: new Date() });
    const [camp] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'Voz', status: 'active', steps }).returning();
    const [lead] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana', phone: '+5511999998888' }).returning();
    await enrollLeads(db, org.id, camp.id, [lead.id], new Date());
    await runScheduler(db, { now: new Date() });
    const [job] = await db.select().from(schema.voiceJobs);

    expect(await completeVoiceAction(db, job)).toBe(true);
    const [action] = await db.select().from(schema.actions);
    expect(action.status).toBe('done');
    expect((await db.select().from(schema.events)).map((e) => e.type)).toContain('voice_sent');
    expect((await db.select().from(schema.enrollments))[0].state).toBe('done'); // era o único passo
  });

  it('ignora job sem ação de campanha (envio manual)', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db);
    expect(await completeVoiceAction(db, { id: randomUUID(), orgId: org.id, userId: user.id, text: 'x' })).toBe(false);
    expect(await db.select().from(schema.events).where(eq(schema.events.orgId, org.id))).toHaveLength(0);
  });
});
