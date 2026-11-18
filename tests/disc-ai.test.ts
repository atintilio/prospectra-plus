import { afterEach, describe, expect, it, vi } from 'vitest';

// Mocka a camada de IA para testar o DISC contextual sem rede.
vi.mock('@/lib/ai', () => ({
  aiConfigured: vi.fn(() => true),
  aiCompleteFree: vi.fn(),
  extrairJson: (t: string) => { try { return JSON.parse(t); } catch { return null; } },
}));

import { aiCompleteFree, aiConfigured } from '@/lib/ai';
import { analyzeDiscContextual } from '@/lib/disc-ai';

const evidence = [{ source: 'linkedin', url: 'https://x/p', text: 'Diretora orientada a metas e crescimento, decide rápido.' }];

afterEach(() => vi.clearAllMocks());

describe('analyzeDiscContextual', () => {
  it('usa os percentuais do GLM, normaliza para 100 e mantém o arquétipo coerente', async () => {
    vi.mocked(aiCompleteFree).mockResolvedValue(JSON.stringify({
      d: 70, i: 20, s: 5, c: 5,
      recommendations: ['Comece pelo resultado.'], avoid: ['Nada de rodeios.'], questions: ['Qual a meta do trimestre?'], behavior: ['Decide rápido com foco em resultado.'],
    }));
    const r = await analyzeDiscContextual({ text: 'perfil', evidence });
    expect(r.primary).toBe('D');
    expect(r.percentages.d + r.percentages.i + r.percentages.s + r.percentages.c).toBe(100);
    expect(r.recommendations).toEqual(['Comece pelo resultado.']);
    expect(r.behavior).toEqual(['Decide rápido com foco em resultado.']);
    expect(r.evidence).toEqual(evidence);
  });

  it('cai no heurístico determinístico quando o GLM devolve lixo', async () => {
    vi.mocked(aiCompleteFree).mockResolvedValue('não é json');
    const r = await analyzeDiscContextual({ text: 'CEO, meta, resultado, decisão', evidence: [] });
    expect(r.primary).toBe('D');
    expect(r.recommendations[0]).toMatch(/direto ao ponto/i);
  });

  it('não chama o GLM quando a IA não está configurada', async () => {
    vi.mocked(aiConfigured).mockReturnValue(false);
    const r = await analyzeDiscContextual({ text: 'análise, dados, compliance, métrica', evidence: [] });
    expect(aiCompleteFree).not.toHaveBeenCalled();
    expect(r.primary).toBe('C');
  });
});
