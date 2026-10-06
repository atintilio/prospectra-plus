import { describe, expect, it } from 'vitest';
import { seedState } from '../src/data';
import { mergeSafeWorkspaceState, visibleWorkspaceState } from '../api/_lib/workspace';

describe('workspace autenticado', () => {
  it('restringe a visão de líder à própria equipe', () => {
    const state = structuredClone(seedState);
    const visible = visibleWorkspaceState(state, { id: 'm1', email: 'marina.costa@argusprime.com.br', role: 'leader', teamId: 'team-receita' });
    expect(visible.opportunities.map((opportunity) => opportunity.id)).toEqual(['opp1', 'opp2']);
    expect(visible.accounts.map((account) => account.id).sort()).toEqual(['a1', 'a4']);
    expect(visible.diagnoses.map((diagnosis) => diagnosis.opportunityId).sort()).toEqual(['opp1', 'opp2']);
    expect(visible.teams.map((team) => team.id)).toEqual(['team-receita']);
    expect(visible.members.every((member) => member.teamId === 'team-receita')).toBe(true);
    expect(visible.signals.every((signal) => visible.accounts.some((account) => account.id === signal.accountId))).toBe(true);
  });

  it('restringe a visão de liderado à própria carteira', () => {
    const state = structuredClone(seedState);
    const visible = visibleWorkspaceState(state, { id: 'm2', email: 'joao.martins@argusprime.com.br', role: 'member', teamId: 'team-receita' });
    expect(visible.opportunities.map((opportunity) => opportunity.id)).toEqual(['opp2']);
    expect(visible.accounts.map((account) => account.id)).toEqual(['a4']);
    expect(visible.diagnoses.map((diagnosis) => diagnosis.opportunityId)).toEqual(['opp2']);
    expect(visible.members.map((member) => member.id).sort()).toEqual(['m1', 'm2']);
    expect(visible.signals.every((signal) => signal.accountId === 'a4')).toBe(true);
  });

  it('preserva dados de equipe, canais e diagnósticos controlados pelo servidor durante uma gravação do owner', () => {
    const current = structuredClone(seedState);
    const candidate = structuredClone(seedState);
    candidate.accounts[0].paused = true;
    candidate.channels[0].status = 'Conectado';
    candidate.teams = [];
    candidate.opportunities = [];
    const merged = mergeSafeWorkspaceState(current, candidate);
    expect(merged.accounts[0].paused).toBe(true);
    expect(merged.channels).toEqual(current.channels);
    expect(merged.teams).toEqual(current.teams);
    expect(merged.opportunities).toEqual(current.opportunities);
  });
});
