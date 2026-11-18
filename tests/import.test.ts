import { describe, expect, it } from 'vitest';
import { leadsFromCsv, leadsFromUrls, normalizeLinkedinUrl } from '@/lib/leads-import';

describe('importação de leads', () => {
  it('normaliza URLs do LinkedIn', () => {
    expect(normalizeLinkedinUrl('https://br.linkedin.com/in/Ana-Souza-123abc/?trk=x')).toBe('https://www.linkedin.com/in/ana-souza-123abc');
    expect(normalizeLinkedinUrl('https://google.com')).toBeNull();
  });
  it('lê CSV com ; e aspas, deduplica por URL e descarta só linhas vazias', () => {
    const csv = 'Nome;Cargo;Empresa;LinkedIn\n"Souza, Ana";CFO;Acme;https://linkedin.com/in/ana\n;;;\nAna;CFO;Acme;linkedin.com/in/ana/';
    const r = leadsFromCsv(csv);
    expect(r.leads).toEqual([{ linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Souza, Ana', headline: 'CFO', company: 'Acme', location: '', email: '', phone: '' }]);
  });
  it('aceita leads parciais sem LinkedIn (nome/e-mail/telefone) para enriquecer depois', () => {
    const csv = 'Nome;Cargo;Empresa;Email;Telefone\nMaria Silva;COO;Beta;maria@beta.com;(11) 99999-0000\n;;;joao@gamma.com;\nSem contato;;;;';
    const r = leadsFromCsv(csv);
    expect(r.invalid).toBe(0);
    expect(r.leads).toHaveLength(3);
    expect(r.leads[0]).toMatchObject({ linkedinUrl: null, fullName: 'Maria Silva', company: 'Beta', email: 'maria@beta.com', phone: '(11) 99999-0000' });
    // sem nome, deriva do e-mail
    expect(r.leads[1]).toMatchObject({ linkedinUrl: null, fullName: 'Joao', email: 'joao@gamma.com' });
    // só nome, sem URL nem e-mail — ainda assim entra para enriquecimento
    expect(r.leads[2]).toMatchObject({ linkedinUrl: null, fullName: 'Sem contato', email: '' });
  });
  it('lê URLs coladas e deduz o nome', () => {
    const r = leadsFromUrls('https://www.linkedin.com/in/marcos-lima-8a7b6c5d\n lixo');
    expect(r.leads[0].fullName).toBe('Marcos Lima');
    expect(r.invalid).toBe(1);
  });
});
