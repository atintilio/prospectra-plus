import { describe, expect, it } from 'vitest';
import { testDb, seedOrg } from './helpers';
import { discoverPendingDisc, getLeadCommunicationProfile } from '@/lib/communication';
import { schema } from '@/db';

// Sem AI nos testes → inferDisc cai no analisador léxico (determinístico).
describe('descoberta DISC em massa', () => {
  it('infere os leads sem perfil, marca indisponível os sem sinal e não reprocessa', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db);
    const [a] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/a', fullName: 'Ana', headline: 'CEO e diretora, foco em resultados, metas e decisões rápidas' }).returning();
    const [b] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/b', fullName: 'Bo' }).returning();

    const r1 = await discoverPendingDisc(db, { orgId: org.id });
    expect(r1).toEqual({ processed: 2, inferred: 1 });

    const scope = { orgId: org.id, userId: user.id };
    expect((await getLeadCommunicationProfile(db, scope, a.id))?.profileType).toBe('D');
    const pb = await getLeadCommunicationProfile(db, scope, b.id);
    expect(pb?.source).toBe('inferred');
    expect(pb?.profileType).toBeNull();
    expect(pb?.evidenceLabel).toBe('unavailable');

    // segunda rodada: ambos já têm perfil, nada a processar
    expect(await discoverPendingDisc(db, { orgId: org.id })).toEqual({ processed: 0, inferred: 0 });
  });
});
