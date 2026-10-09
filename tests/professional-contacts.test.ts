import { describe, expect, it } from 'vitest';
import { normalizeProfessionalContacts } from '../server/integrations/scrapegraph';

describe('normalização de contatos profissionais públicos', () => {
  it('mantém pessoas com cargo e remove caixas institucionais', () => {
    const contacts = normalizeProfessionalContacts({ contacts: [
      { name: 'Ana Silva', role: 'Diretora Comercial', email: 'ana.silva@empresa.com', linkedinUrl: 'https://www.linkedin.com/in/ana-silva' },
      { name: 'Caixa', role: 'Atendimento', email: 'contato@empresa.com' },
      { name: 'Sem cargo', email: 'pessoa@empresa.com' },
    ] }, 'https://empresa.com/equipe', '2026-10-09T00:00:00.000Z');
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ name: 'Ana Silva', role: 'Diretora Comercial', email: 'ana.silva@empresa.com' });
  });
});
