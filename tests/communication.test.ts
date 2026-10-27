import { describe, expect, it } from 'vitest';
import { testDb, seedOrg } from './helpers';
import { getLeadCommunicationProfile, getCommunicationGuidance, estimateDiscType, saveLeadCommunicationProfile } from '@/lib/communication';
import { schema } from '@/db';

const balancedAnswers = { q1: 'D', q2: 'I', q3: 'S', q4: 'C' } as const;

describe('perfil de comunicação', () => {
  it('classifica apenas quando uma quadrante tem maioria mínima; empate fica indisponível', () => {
    expect(estimateDiscType({ q1: 'D', q2: 'D', q3: 'D', q4: 'I' })).toMatchObject({ status: 'estimate', type: 'D' });
    expect(estimateDiscType(balancedAnswers)).toMatchObject({ status: 'unavailable', type: null });
    expect(estimateDiscType({ q1: 'D', q2: 'D', q3: 'x', q4: 'I' })).toMatchObject({ status: 'incomplete', type: null });
  });

  it('não gera recomendação para perfil sem evidência', () => {
    expect(getCommunicationGuidance(null)).toBeNull();
    expect(getCommunicationGuidance('unknown')).toBeNull();
    expect(getCommunicationGuidance('Di')?.quadrant).toBe('D');
  });

  it('salva respostas como estimativa e limita leitura e gravação ao lead da carteira do usuário', async () => {
    const db = await testDb();
    const a = await seedOrg(db, 'Comunicação A');
    const b = await seedOrg(db, 'Comunicação B');
    const [lead] = await db.insert(schema.leads).values({ orgId: a.org.id, ownerId: a.user.id, linkedinUrl: 'https://www.linkedin.com/in/comunicacao-a', fullName: 'Contato A' }).returning();

    const saved = await saveLeadCommunicationProfile(db, { orgId: a.org.id, userId: a.user.id }, lead.id, {
      source: 'observational_quiz', answers: { q1: 'D', q2: 'D', q3: 'D', q4: 'I' },
      preferences: { preferredChannel: 'email', preferredFormat: 'bullets', notes: '' },
    });
    expect(saved).toMatchObject({ source: 'observational_quiz', evidenceLabel: 'estimate', profileType: 'D' });
    expect(saved?.answers).toEqual({ q1: 'D', q2: 'D', q3: 'D', q4: 'I' });
    expect((await getLeadCommunicationProfile(db, { orgId: a.org.id, userId: a.user.id }, lead.id))?.evidenceLabel).toBe('estimate');
    const updated = await saveLeadCommunicationProfile(db, { orgId: a.org.id, userId: a.user.id }, lead.id, {
      source: 'observational_quiz', answers: { q1: 'D', q2: 'D', q3: 'D', q4: 'I' },
      preferences: { preferredChannel: 'linkedin', preferredFormat: 'text', notes: '' },
    });
    expect(updated?.assessedAt).toEqual(saved?.assessedAt);
    expect(updated?.preferences.preferredChannel).toBe('linkedin');
    await expect(getLeadCommunicationProfile(db, { orgId: b.org.id, userId: b.user.id }, lead.id)).resolves.toBeNull();
    await expect(saveLeadCommunicationProfile(db, { orgId: a.org.id, userId: b.user.id }, lead.id, {
      source: 'manual', profileType: 'D', preferences: { preferredChannel: 'unknown', preferredFormat: 'unknown', notes: '' },
    })).rejects.toThrow();
    const [otherSeller] = await db.insert(schema.users).values({ email: 'outro-vendedor@comunicacao-a.x', name: 'Outro vendedor', status: 'active' }).returning();
    await db.insert(schema.memberships).values({ orgId: a.org.id, userId: otherSeller.id, role: 'sdr' });
    await expect(getLeadCommunicationProfile(db, { orgId: a.org.id, userId: otherSeller.id }, lead.id)).resolves.toBeNull();
    await expect(saveLeadCommunicationProfile(db, { orgId: a.org.id, userId: otherSeller.id }, lead.id, {
      source: 'manual', profileType: 'D', preferences: { preferredChannel: 'unknown', preferredFormat: 'unknown', notes: '' },
    })).rejects.toThrow();
  });

  it('grava tipo declarado manualmente sem misturar com respostas estimadas', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Comunicação declarada');
    const [lead] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/comunicacao-manual', fullName: 'Contato Manual' }).returning();
    const saved = await saveLeadCommunicationProfile(db, { orgId: org.id, userId: user.id }, lead.id, {
      source: 'manual', profileType: 'Sc', preferences: { preferredChannel: 'whatsapp', preferredFormat: 'text', notes: 'Prefere mensagens curtas.' },
    });
    expect(saved).toMatchObject({ source: 'manual', evidenceLabel: 'declared', profileType: 'Sc', answers: {} });
    expect(getCommunicationGuidance(saved?.profileType ?? null)?.quadrant).toBe('S');
  });
});
