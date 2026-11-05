import { describe, expect, it } from 'vitest';
import { extrairJson } from '@/lib/ai';

describe('extração do JSON da IA', () => {
  it('lê JSON puro', () => {
    expect(extrairJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('lê JSON dentro de cerca de markdown', () => {
    const resposta = '```json\n{\n  "offerIndex": 0,\n  "question": "priority"\n}\n```';
    expect(extrairJson<{ offerIndex: number }>(resposta)).toEqual({ offerIndex: 0, question: 'priority' });
  });

  it('lê JSON com texto antes e depois', () => {
    const resposta = 'Claro, aqui está o plano:\n{"offerIndex": 1}\nEspero ajudar.';
    expect(extrairJson<{ offerIndex: number }>(resposta)).toEqual({ offerIndex: 1 });
  });

  it('lê JSON aninhado', () => {
    const resposta = '```json\n{"evidence":[{"field":"company","quote":"Atlas"}]}\n```';
    expect(extrairJson<{ evidence: unknown[] }>(resposta)).toEqual({ evidence: [{ field: 'company', quote: 'Atlas' }] });
  });

  it('devolve null quando não há JSON', () => {
    expect(extrairJson('sem json aqui')).toBeNull();
    expect(extrairJson('')).toBeNull();
  });
});
