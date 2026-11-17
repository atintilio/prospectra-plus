import { expect, test } from 'vitest';
import { analyzeDisc } from '../src/lib/disc';

test('identifica tendência de dominância e recomenda comunicação direta', () => {
  const result = analyzeDisc({
    text: 'CEO, crescimento, decisão, meta, resultado, urgente',
    evidence: [],
  });

  expect(result.primary).toBe('D');
  expect(result.recommendations).toContain('Vá direto ao ponto e comece pelo resultado esperado.');
  expect(result.avoid).toContain('Evite textos longos antes de apresentar a proposta.');
  expect(result.archetype).toBe('Executor');
  expect(result.behavior.length).toBeGreaterThan(0);
});

test('transforma evidências públicas em recomendações rastreáveis', () => {
  const result = analyzeDisc({
    text: 'perfil público',
    evidence: [{ source: 'linkedin', url: 'https://example.com/p', text: 'Analista de dados escreve sobre qualidade, métricas e compliance.' }],
  });
  expect(result.primary).toBe('C');
  expect(result.evidence).toEqual([{ source: 'linkedin', url: 'https://example.com/p', text: 'Analista de dados escreve sobre qualidade, métricas e compliance.' }]);
  expect(result.writingStyle).toContain('estruturada');
});

test('não apresenta perfil como certeza quando os sinais são insuficientes', () => {
  const result = analyzeDisc({ text: 'Profissional', evidence: [] });
  expect(result.confidence).toBe('low');
  expect(result.disclaimer).toMatch(/estimativa/i);
});
