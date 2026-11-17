import { describe, expect, it, vi } from 'vitest';
import { normalizeTarget } from '../normalize';
import { runInvestigation } from '../worker';

describe('Argus worker', () => {
  it('normaliza e rejeita credenciais', () => {
    expect(normalizeTarget({ domain: 'WWW.Example.com/' }).domain).toBe('example.com');
    expect(() => normalizeTarget({ profileUrl: 'https://user:pass@example.com' })).toThrow();
  });
  it('faz retry, deduplica e retorna parcial', async () => {
    const unstable = { name: 'unstable', collect: vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue([{ id: 'same', source: 'x', url: 'https://x.test', kind: 'company', value: 'Acme', collectedAt: new Date().toISOString(), confidence: 'probable' as const }]) };
    const failed = { name: 'failed', collect: vi.fn().mockRejectedValue(new Error('offline')) };
    const result = await runInvestigation({ id: 'i-1', target: { company: 'Acme' }, sources: [unstable, failed] }, { retries: 1 });
    expect(result.status).toBe('partial');
    expect(result.evidence).toHaveLength(1);
    expect(unstable.collect).toHaveBeenCalledTimes(2);
    expect(result.errors).toHaveLength(1);
  });
  it('preserva conflito em vez de sobrescrever', async () => {
    const source = { name: 'conflict', collect: async () => [
      { id: 'a', source: 'x', url: 'https://x.test', kind: 'company', value: 'Acme', collectedAt: new Date().toISOString(), confidence: 'probable' as const },
      { id: 'b', source: 'y', url: 'https://y.test', kind: 'company', value: 'Beta', collectedAt: new Date().toISOString(), confidence: 'candidate' as const },
    ] };
    const result = await runInvestigation({ id: 'i-2', target: { company: 'Acme' }, sources: [source] });
    expect(result.status).toBe('completed');
    expect(result.conflicts).toEqual(['Valores conflitantes para company']);
  });
});
