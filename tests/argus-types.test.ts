import { expect, test } from 'vitest';
import { createLeadEnrichment, parseLeadEnrichment } from '../src/lib/argus/types';

test('cria um snapshot Argus vazio com estado parcial', () => {
  const enrichment = createLeadEnrichment();
  expect(enrichment).toEqual({
    version: 1,
    status: 'partial',
    evidence: [],
    signals: [],
    conflicts: [],
  });
  expect(parseLeadEnrichment(enrichment)).toEqual(enrichment);
});

test('rejeita evidência sem URL ou data de coleta válidas', () => {
  expect(() => parseLeadEnrichment({
    ...createLeadEnrichment(),
    evidence: [{
      id: 'evidence-1', source: 'public-site', url: 'not-a-url', kind: 'company',
      collectedAt: '2026-11-17T12:00:00Z', confidence: 'confirmed',
    }],
  })).toThrow();
});

test('rejeita sinal sem vínculo com evidência', () => {
  expect(() => parseLeadEnrichment({
    ...createLeadEnrichment(),
    signals: [{ key: 'role', label: 'Cargo', value: 'CEO', confidence: 'probable', evidenceIds: [] }],
  })).toThrow();
});
