import { describe, expect, it } from 'vitest';
import { leadsFromCsv } from '@/lib/leads-import';

describe('CSV com dados parciais', () => {
  it('aceita nome, e-mail ou telefone sem LinkedIn e preserva campos disponíveis', () => {
    const result = leadsFromCsv('nome,email,telefone,empresa\nAna,ANA@example.test,,Acme\n,bruno@example.test,,\n,,+55 11 99999-0000,\nCarla,,,');
    expect(result.invalid).toBe(0);
    expect(result.leads).toHaveLength(4);
    expect(result.leads.map(lead => lead.linkedinUrl)).toEqual(['', '', '', '']);
    expect(result.leads[0]).toMatchObject({ fullName: 'Ana', email: 'ana@example.test', company: 'Acme' });
    expect(result.leads[1].fullName).toBe('bruno@example.test');
    expect(result.leads[2].phone).toBe('+5511999990000');
  });
  it('deduplica contatos identificados, mas preserva homônimos', () => {
    const result = leadsFromCsv('nome,email,telefone\nAna,ANA@example.test,\nOutra grafia,ana@example.test,\nTelefone,,+55 11 99999-0000\nMesmo telefone,,5511999990000\nJoão,,\nJoão,,');
    expect(result.leads).toHaveLength(4);
    expect(result.leads.filter(lead => lead.fullName === 'João')).toHaveLength(2);
  });
  it('ignora linha sem identificação e não derruba o arquivo por URL malformada', () => {
    const result = leadsFromCsv('nome,email,linkedin,empresa\n,,,Só empresa\nAna,ana@example.test,https://linkedin.com/in/%ZZ,Acme');
    expect(result.invalid).toBe(1);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].linkedinUrl).toBe('');
  });
});
