import { describe, expect, it } from 'vitest';
import { parseCampaignSuggestion, suggestCampaignSequence } from '@/lib/campaign-suggestion';

const proposal = { steps: [
  { type: 'email', name: 'Primeiro contato', delayDays: 0, template: 'Olá {nome}, gostaria de conversar sobre o diagnóstico fiscal da {empresa}.', subject: 'Diagnóstico fiscal' },
  { type: 'whatsapp', name: 'Acompanhamento', delayDays: 2, template: 'Olá {nome}, posso enviar detalhes sobre o diagnóstico fiscal?' },
] };

describe('sugestão de campanha', () => {
  it('usa briefing e ofertas para gerar etapas revisáveis sem persistência', async () => {
    let prompt = '';
    const steps = await suggestCampaignSequence({
      brief: 'Abordagem consultiva para indústrias',
      seller: { sellerName: 'Ana', companyName: 'Exemplo', strategy: 'Sem pressão', offers: [{ name: 'Diagnóstico fiscal', description: 'Revisão de processos fiscais' }] },
      linkedinEnabled: false,
    }, async (_system, user) => { prompt = user; return JSON.stringify(proposal); });
    expect(prompt).toContain('Abordagem consultiva para indústrias');
    expect(prompt).toContain('Diagnóstico fiscal');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ type: 'email', subject: 'Diagnóstico fiscal', condition: 'always', useAi: true });
    expect(steps[1]).toMatchObject({ type: 'whatsapp', condition: 'always', useAi: true });
    expect(steps[0].id).not.toBe(steps[1].id);
  });

  it('rejeita canal indisponível, assunto ausente e resposta fora do formato', () => {
    expect(() => parseCampaignSuggestion({ steps: [{ ...proposal.steps[0], type: 'invite' }, proposal.steps[1]] }, false)).toThrow('INVALID_CHANNEL');
    expect(() => parseCampaignSuggestion({ steps: [{ ...proposal.steps[0], subject: undefined }, proposal.steps[1]] }, false)).toThrow('INVALID_EMAIL_SUBJECT');
    expect(() => parseCampaignSuggestion({ steps: [{ ...proposal.steps[0], type: 'call' }, proposal.steps[1]] }, true)).toThrow();
    expect(() => parseCampaignSuggestion({ steps: [proposal.steps[0]] }, false)).toThrow();
  });
});
