import { describe, expect, it } from 'vitest';
import { createCampaignDraft } from '../src/campaigns';
import { seedState } from '../src/data';

describe('criação de campanhas', () => {
  const base = seedState.accounts[0];
  const accounts = [{ ...base, id: 'ready', paused: false, suppressed: false }, { ...base, id: 'paused', paused: true }, { ...base, id: 'opposed', suppressed: true }];
  it('cria rascunho sem aprovação, tarefas ou envio e elimina seleções duplicadas', () => {
    const campaign = createCampaignDraft({ name: ' Piloto ', icp: ' Gestores ', accountIds: ['ready', 'ready'] }, accounts, 'new');
    expect(campaign.accounts).toEqual(['ready']);
    expect(campaign.name).toBe('Piloto');
    expect(campaign.status).toBe('Em revisão');
    expect(campaign.copy.state).toBe('Rascunho');
    expect(campaign.copy.approvedAt).toBeUndefined();
    expect(campaign.tasks).toEqual([]);
  });
  it.each(['paused', 'opposed', 'missing'])('rejeita conta indisponível %s', (id) => {
    expect(() => createCampaignDraft({ name: 'Piloto', icp: 'Gestores', accountIds: ['ready', id] }, accounts, 'new')).toThrow('CAMPAIGN_ACCOUNTS_INVALID');
  });
  it('exige nome, objetivo e pelo menos uma conta', () => {
    expect(() => createCampaignDraft({ name: ' ', icp: 'Gestores', accountIds: ['ready'] }, accounts, 'new')).toThrow();
    expect(() => createCampaignDraft({ name: 'Piloto', icp: ' ', accountIds: ['ready'] }, accounts, 'new')).toThrow();
    expect(() => createCampaignDraft({ name: 'Piloto', icp: 'Gestores', accountIds: [] }, accounts, 'new')).toThrow();
  });
});
