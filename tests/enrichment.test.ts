import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyBatchEnrichment, applyEnrichmentToAccount, type CompanyExtraction } from '../src/enrichment-model';
import { discoverCompanyPeople, enrichCompany, linkedinProfileUrl, normalizePublicContacts, scrapeGraphCredits } from '../server/integrations/scrapegraph';
import type { Account } from '../src/types';

function account(): Account {
  return { id: 'company-1', name: 'Empresa Exemplo', domain: 'example.com', sector: 'Não informado', employees: 'Não informado', tier: 'Tier 2', journey: 'Aquisição', relationship: 'Prospect', owner: 'Owner', score: 50, scoreReason: 'Revisar', stage: 'A revisar', paused: false, suppressed: false, contacts: [], evidence: [], activities: [] };
}
const extraction: CompanyExtraction = {
  provider: 'ScrapeGraphAI', requestId: 'request-1', sourceUrl: 'https://example.com/equipe', extractedAt: '2026-10-06T12:00:00.000Z',
  data: { companyName: 'Empresa Exemplo', sector: 'Serviços', description: 'Foco em empresas B2B.' },
  contacts: [{ name: 'Ana Pereira', role: 'Diretora', email: '', phone: '+55 11 3333-4444', linkedin: 'https://www.linkedin.com/in/ana-pereira/', sourceUrl: 'https://example.com/equipe' }],
};
describe('enriquecimento revisável', () => {
  it('salva contato selecionado, telefone e LinkedIn com origem, sem conceder opt-in ou verificação', () => {
    const result = applyEnrichmentToAccount(account(), extraction, extraction.contacts, 'Owner');
    expect(result.contacts[0]).toMatchObject({ name: 'Ana Pereira', phone: '+55 11 3333-4444', linkedin: 'https://www.linkedin.com/in/ana-pereira/', status: 'A revisar', optIn: false, sourceUrl: extraction.sourceUrl });
    expect(result.evidence.every((item) => !item.verified)).toBe(true);
    expect(result.sector).toBe('Serviços');
    expect(applyEnrichmentToAccount(result, extraction, extraction.contacts, 'Owner').contacts).toHaveLength(1);
  });
  it('lote gera conta real e incorpora contatos sugeridos', () => {
    const result = applyBatchEnrichment([], [{ row: { index: 2, values: { empresa: 'Empresa Exemplo' } }, extraction }], 'Owner');
    expect(result.created).toBe(1);
    expect(result.accounts[0].contacts[0].phone).toBe('+55 11 3333-4444');
    expect(result.accounts[0].evidence.length).toBeGreaterThan(0);
  });
  it('rejeita LinkedIn externo, telefone sem evidência no texto e URLs sem fonte', () => {
    expect(linkedinProfileUrl('https://linkedin.com.evil.com/in/ana')).toBe('');
    const candidates = normalizePublicContacts([{ name: 'Ana Pereira', phone: '+55 11 99999-1234', linkedin: 'https://www.linkedin.com/in/ana', sourceUrl: 'https://example.com/equipe' }], ['https://example.com/equipe'], { 'https://example.com/equipe': 'Contato: Ana Pereira, tel +55 11 3333-4444' });
    expect(candidates[0].phone).toBe('');
    expect(candidates[0].linkedin).toBe('');
    expect(normalizePublicContacts([{ name: 'Ana Pereira', sourceUrl: 'https://evil.example' }], ['https://example.com/equipe', 'https://linkedin.com/in/ana'])).toHaveLength(0);
  });
  it('verifica créditos sem executar pesquisa ou extração', async () => {
    vi.stubEnv('SGAI_API_KEY', 'chave-teste'); vi.stubEnv('SGAI_BASE_URL', 'https://v2-api.scrapegraphai.com');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ remaining: 42 }), { status: 200 }));
    expect(await scrapeGraphCredits()).toEqual({ remaining: 42 });
    expect(spy.mock.calls[0][0]).toBe('https://v2-api.scrapegraphai.com/api/credits');
  });
  it('descobre um perfil público e preserva o telefone somente se aparecer na página de origem', async () => {
    vi.stubEnv('SGAI_API_KEY', 'chave-teste'); vi.stubEnv('SGAI_BASE_URL', 'https://v2-api.scrapegraphai.com');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'search-1', results: [
        { url: 'https://www.linkedin.com/in/ana-pereira/?trk=search', title: 'Ana Pereira - Empresa Exemplo', content: 'Ana Pereira - Diretora na Empresa Exemplo' },
        { url: 'https://example.com/equipe', title: 'Equipe', content: 'Ana Pereira, telefone +55 11 3333-4444' },
      ], json: { contacts: [
        { name: 'Ana Pereira', role: 'Diretora', linkedin: 'https://www.linkedin.com/in/ana-pereira', sourceUrl: 'https://www.linkedin.com/in/ana-pereira/?trk=search' },
        { name: 'Ana Pereira', role: 'Diretora', phone: '+55 11 3333-4444', sourceUrl: 'https://example.com/equipe' },
        { name: 'Pessoa Inventada', phone: '+55 11 99999-0000', sourceUrl: 'https://other.example' },
      ] },
    }), { status: 200 }));
    const found = await discoverCompanyPeople('Empresa Exemplo', 'example.com');
    expect(found.contacts).toHaveLength(1);
    expect(found.contacts[0].linkedin).toContain('linkedin.com/in/ana-pereira');
    expect(found.contacts[0].phone).toBe('+55 11 3333-4444');
    expect(found.contacts[0].sourceUrls).toHaveLength(2);
    expect(found.contacts.some((contact) => contact.name === 'Pessoa Inventada')).toBe(false);
  });
  it('não apresenta uma resposta vazia como enriquecimento concluído', async () => {
    vi.stubEnv('SGAI_API_KEY', 'chave-teste'); vi.stubEnv('SGAI_BASE_URL', 'https://v2-api.scrapegraphai.com');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'request', json: {} }), { status: 200 }));
    await expect(enrichCompany('https://example.com')).rejects.toThrow('SCRAPEGRAPH_EMPTY_RESULT');
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
