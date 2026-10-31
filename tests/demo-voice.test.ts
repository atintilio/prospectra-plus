import { describe, expect, it } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import { schema, type DB } from '@/db';
import { seedVoice, type VoiceDemoCtx } from '@/lib/demo-voice';
import { seedOrg, testDb } from './helpers';

/** Gerador determinístico (o mesmo do seed da demo: `rng(42)`). */
function rng(seed: number): () => number {
  let state = seed;
  return () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

/** Momento fixo: o seed precisa ser determinístico. */
const NOW = new Date('2026-11-02T12:00:00.000Z');

async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'Demonstração · Atlas Consultoria');
  await db.update(schema.orgs).set({ isDemo: true }).where(eq(schema.orgs.id, org.id));

  const [mariana, camila] = await db
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
    ])
    .returning();

  const ctx: VoiceDemoCtx = {
    orgId: org.id,
    userId: user.id,
    userIds: [user.id],
    leads: [mariana, camila].map((lead) => ({
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

  return { db, org, user, ctx, mariana, camila };
}

async function total(db: DB, table: typeof schema.voiceProfiles | typeof schema.voiceJobs | typeof schema.voiceRegistrations, orgId: string): Promise<number> {
  const rows = await db.select({ n: count() }).from(table).where(eq(table.orgId, orgId));
  return rows[0]?.n ?? 0;
}

describe('demo — voz do vendedor', () => {
  it('cria o perfil de voz, a fila de áudio e o registro de consentimento', async () => {
    const { db, org, user, ctx } = await setup();

    const result = await seedVoice(db, ctx);

    // 1) Perfil de voz do dono da demonstração.
    const profiles = await db.select().from(schema.voiceProfiles).where(eq(schema.voiceProfiles.orgId, org.id));
    expect(profiles).toHaveLength(1);
    expect(profiles[0].userId).toBe(user.id);
    expect(profiles[0].externalId).toBe('de3a0001');
    expect(profiles[0].engine).toBe('moss-tts-nano');
    expect(profiles[0].enabled).toBe(true);
    expect(profiles[0].consentAt).toBeInstanceOf(Date);
    expect(profiles[0].consentAt.getTime()).toBeLessThan(NOW.getTime());
    expect(result.profile.externalId).toBe('de3a0001');

    // 2) Fila: um job enviado e um job na fila.
    const jobs = await db.select().from(schema.voiceJobs).where(eq(schema.voiceJobs.orgId, org.id));
    expect(jobs).toHaveLength(2);
    const enviado = jobs.find((job) => job.state === 'sent');
    const naFila = jobs.find((job) => job.state === 'queued');
    expect(enviado).toBeTruthy();
    expect(naFila).toBeTruthy();
    expect(enviado?.profileId).toBe('de3a0001');
    expect(enviado?.kind).toBe('audio');
    expect(enviado?.recipient).toMatch(/^\+55519\d{8}$/);
    expect(enviado?.text).toContain('Atlas');
    expect(enviado?.startedAt).toBeInstanceOf(Date);
    expect(naFila?.profileId).toBe('de3a0001');
    expect(naFila?.recipient).not.toBe(enviado?.recipient);
    expect(naFila?.text).toBeTruthy();

    // 3) Registro de cadastro de voz do vendedor.
    const registrations = await db.select().from(schema.voiceRegistrations).where(eq(schema.voiceRegistrations.orgId, org.id));
    expect(registrations).toHaveLength(1);
    expect(registrations[0].userId).toBe(user.id);
    expect(registrations[0].createdAt).toBeInstanceOf(Date);
  });

  it('não toca a org de produção', async () => {
    const { db, ctx } = await setup();
    const outra = await seedOrg(db, 'Operação Real');

    await seedVoice(db, ctx);

    expect(await total(db, schema.voiceProfiles, outra.org.id)).toBe(0);
    expect(await total(db, schema.voiceJobs, outra.org.id)).toBe(0);
    expect(await total(db, schema.voiceRegistrations, outra.org.id)).toBe(0);
  });

  it('roda duas vezes sem duplicar nada', async () => {
    const { db, org, ctx } = await setup();

    const primeira = await seedVoice(db, ctx);
    const segunda = await seedVoice(db, ctx);

    expect(await total(db, schema.voiceProfiles, org.id)).toBe(1);
    expect(await total(db, schema.voiceJobs, org.id)).toBe(2);
    expect(await total(db, schema.voiceRegistrations, org.id)).toBe(1);

    expect(segunda.profile.externalId).toBe(primeira.profile.externalId);
    expect(segunda.jobs.map((job) => job.id)).toEqual(primeira.jobs.map((job) => job.id));
    expect(segunda.jobs.map((job) => job.recipient)).toEqual(primeira.jobs.map((job) => job.recipient));
    expect(segunda.registration.id).toBe(primeira.registration.id);
  });

  it('não usa telefone nem e-mail real', async () => {
    const { db, org, ctx } = await setup();
    await seedVoice(db, ctx);

    const jobs = await db.select().from(schema.voiceJobs).where(eq(schema.voiceJobs.orgId, org.id));
    for (const job of jobs) {
      expect(job.recipient).toMatch(/^\+55519\d{8}$/);
    }
    const profiles = await db.select().from(schema.voiceProfiles).where(and(eq(schema.voiceProfiles.orgId, org.id)));
    expect(profiles[0].externalId).not.toMatch(/@/);
  });
});
