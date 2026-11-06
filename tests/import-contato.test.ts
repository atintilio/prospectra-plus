import { describe, expect, it } from 'vitest';
import { leadsFromCsv, normalizaTelefone } from '@/lib/leads-import';

describe('importação de leads com contato', () => {
  const csv = [
    'linkedin url,nome,cargo,empresa,cidade,email,telefone',
    'https://www.linkedin.com/in/maria-souza,Maria Souza,Diretora,Acme ME,"Curitiba, SC",maria@acme.com.br,"+55 41 98888-7777"',
    'https://www.linkedin.com/in/joao-lima,Joao Lima,Gerente,Beta SA,Recife,joao@beta.com.br,(81) 97777-6666',
  ].join('\n');

  it('lê e-mail e telefone do CSV (antes eram descartados)', () => {
    const { leads } = leadsFromCsv(csv);
    expect(leads).toHaveLength(2);
    expect(leads[0].email).toBe('maria@acme.com.br');
    expect(leads[0].phone).toBe('+5541988887777');
    expect(leads[1].email).toBe('joao@beta.com.br');
    expect(leads[1].phone).toBe('81977776666');
  });

  it('deixa o contato vazio quando o CSV não tem a coluna', () => {
    const { leads } = leadsFromCsv('linkedin url,nome\nhttps://www.linkedin.com/in/sem-contato,Sem Contato');
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe('');
    expect(leads[0].phone).toBe('');
  });

  it('normaliza o telefone para o formato internacional', () => {
    expect(normalizaTelefone('+55 63 96882-5489')).toBe('+5563968825489');
    expect(normalizaTelefone('(49) 9999-8888')).toBe('4999998888');
    expect(normalizaTelefone('  ')).toBe('');
  });
});
