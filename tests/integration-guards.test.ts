import { describe, expect, it } from 'vitest';
import { normalizeLinkedInProfileUrl, safeTask } from '../server/api/_lib/bridge';
import { normalizeWhatsappNumber } from '../server/integrations/evolution';

describe('guards das integrações', () => {
  it('normaliza LinkedIn sem www e rejeita hosts externos', () => {
    expect(normalizeLinkedInProfileUrl('https://linkedin.com/in/ana-teste')).toBe('https://www.linkedin.com/in/ana-teste/');
    expect(normalizeLinkedInProfileUrl('https://example.com/in/ana-teste')).toBeNull();
  });

  it('não cria tarefa de escrita Abridge sem campanha e mensagem', () => {
    expect(safeTask({ action: 'send_message', profileUrl: 'https://www.linkedin.com/in/ana-teste', message: 'oi' }, 'user-1')).toBeNull();
    expect(safeTask({ action: 'send_message', profileUrl: 'https://www.linkedin.com/in/ana-teste', message: 'oi', campaignTaskId: 'task-1' }, 'user-1')?.requiresConfirmation).toBe(true);
  });

  it('normaliza telefone internacional e rejeita números curtos', () => {
    expect(normalizeWhatsappNumber('+55 (11) 99999-1234')).toBe('5511999991234');
    expect(() => normalizeWhatsappNumber('123')).toThrow('EVOLUTION_INVALID_NUMBER');
  });
});
