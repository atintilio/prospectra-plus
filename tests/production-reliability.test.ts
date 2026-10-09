import { describe, it, expect } from 'vitest';
import { seedState } from '../src/data';
import { evaluateWorkspace } from '../server/api/_lib/intelligence';
import { deliveryOutcome } from '../src/delivery';

describe('produção: avaliação com evidências', () => {
 it('bloqueia contas sem evidências verificadas', () => { const state = structuredClone(seedState); state.accounts[0].evidence = []; state.accounts[0].contacts = []; const result = evaluateWorkspace(state); expect(result.accounts[0].ready).toBe(false); expect(result.accounts[0].missing).toContain('Evidência verificada'); expect(result.engine).toBe('rules-v1'); });
 it('oposição prevalece sobre dados completos', () => { const state = structuredClone(seedState); state.accounts[0].suppressed = true; expect(evaluateWorkspace(state).accounts.find(a => a.accountId === state.accounts[0].id)?.nextAction).toBe('Não contatar: oposição registrada.'); });
 it('não libera tarefa com aprovação de outra revisão', () => { const state = structuredClone(seedState); const campaign = state.campaigns[0]; campaign.copy.revision += 1; const result = evaluateWorkspace(state); expect(result.tasks.filter(t => campaign.tasks.some(x => x.id === t.taskId)).every(t => !t.ready)).toBe(true); });
});
describe('produção: confirmação de envio', () => {
 it('aceite na fila não é envio', () => { expect(deliveryOutcome({ queued: true })).toBe('queued'); expect(deliveryOutcome({ ok: true })).toBe('unknown'); });
 it('só conclui com comprovante do provedor', () => { expect(deliveryOutcome({ receipt: { providerMessageId: 'abc', status: 'sent' } })).toBe('sent'); expect(deliveryOutcome({ receipt: { status: 'sent' } })).toBe('unknown'); });
});
