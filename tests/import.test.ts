import { describe, expect, it } from 'vitest';
import { leadsFromCsv, leadsFromUrls, normalizeLinkedinUrl } from '@/lib/leads-import';

describe('importação de leads', () => {
  it('normaliza URLs do LinkedIn', () => {
    expect(normalizeLinkedinUrl('https://br.linkedin.com/in/Ana-Souza-123abc/?trk=x')).toBe('https://www.linkedin.com/in/ana-souza-123abc');
    expect(normalizeLinkedinUrl('https://google.com')).toBeNull();
  });
  it('lê CSV com ; e aspas, ignora linhas sem perfil e duplicadas', () => {
    const csv = 'Nome;Cargo;Empresa;LinkedIn\n"Souza, Ana";CFO;Acme;https://linkedin.com/in/ana\nSem perfil;CEO;X;\nAna;CFO;Acme;linkedin.com/in/ana/';
    const r = leadsFromCsv(csv);
    expect(r.leads).toEqual([{ linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Souza, Ana', headline: 'CFO', company: 'Acme', location: '' }]);
    expect(r.invalid).toBe(1);
  });
  it('lê URLs coladas e deduz o nome', () => {
    const r = leadsFromUrls('https://www.linkedin.com/in/marcos-lima-8a7b6c5d\n lixo');
    expect(r.leads[0].fullName).toBe('Marcos Lima');
    expect(r.invalid).toBe(1);
  });
});
