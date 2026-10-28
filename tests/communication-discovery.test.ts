import { test, expect, beforeEach } from 'vitest';
import { testDb, seedOrg } from './helpers';
import { schema, type DB } from '@/db';
import { lexicalDiscScores, inferDisc } from '@/lib/communication-discovery';
import { getLeadCommunicationProfile, saveLeadCommunicationProfile } from '@/lib/communication';

// Sem chave de IA nos testes: inferDisc cai no analisador léxico (determinístico).
beforeEach(() => { delete process.env.AI_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.AI_BASE_URL; });

async function seedLead(db: DB, orgId: string, ownerId: string) {
  const [lead] = await db.insert(schema.leads).values({ orgId, ownerId, linkedinUrl: `https://www.linkedin.com/in/${crypto.randomUUID()}`, fullName: 'Lead', headline: '', company: '' }).returning();
  return lead;
}

test('lexicalDiscScores aponta o quadrante pelos sinais do texto, e null sem sinal', () => {
  expect(lexicalDiscScores('Diretor de vendas, foco em resultado, metas agressivas e decisão rápida').quadrant).toBe('D');
  expect(lexicalDiscScores('Engenheiro de dados; análise, métricas e qualidade técnica').quadrant).toBe('C');
  expect(lexicalDiscScores('xxxxx yyyyy zzzzz').quadrant).toBeNull();
});

test('inferDisc usa o léxico quando não há IA configurada', async () => {
  const d = await inferDisc('CEO focada em resultado, metas e decisões rápidas');
  expect(d).toEqual({ type: 'D', source: 'lexical' });
  const nada = await inferDisc('oi'); // curto demais
  expect(nada.type).toBeNull();
});

test('salvar perfil inferido grava como estimativa e traz orientação', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'DISC A');
  const scope = { orgId: a.org.id, userId: a.user.id };
  const lead = await seedLead(db, a.org.id, a.user.id);
  const { type } = await inferDisc('Analista de qualidade; dados, detalhes e processos técnicos');
  expect(type).toBe('C');
  await saveLeadCommunicationProfile(db, scope, lead.id, { source: 'inferred', profileType: type });
  const saved = await getLeadCommunicationProfile(db, scope, lead.id);
  expect(saved!.source).toBe('inferred');
  expect(saved!.evidenceLabel).toBe('estimate');
  expect(saved!.profileType).toBe('C');
  expect(saved!.guidance).not.toBeNull(); // orientação de abordagem disponível para o Harvey
});
