import { describe, expect, it } from 'vitest';
import { seedState } from '../src/data';
import { approveCopy, canCreateAssistedTask, pauseAfterReply, reviseCopy, suppressAccount } from '../src/policy';

describe('guardas do Prospectra+', () => {
  it('invalida uma aprovação quando a copy muda', () => {
    const copy = approveCopy(seedState.campaigns[0].copy, '2026-10-05T17:00:00Z');
    expect(reviseCopy(copy, `${copy.text} Atualizada.`)).toMatchObject({ state: 'Invalidado', revision: 4 });
  });

  it('pausa uma conta após resposta e impede nova tarefa assistida', () => {
    const approved = approveCopy(seedState.campaigns[0].copy, '2026-10-05T17:00:00Z');
    const paused = pauseAfterReply(seedState.accounts[0]);
    expect(paused.paused).toBe(true);
    expect(canCreateAssistedTask(paused, approved)).toBe(false);
  });

  it('mantém oposição como supressão persistente', () => {
    const suppressed = suppressAccount(seedState.accounts[1]);
    expect(suppressed).toMatchObject({ paused: true, suppressed: true });
    expect(canCreateAssistedTask(suppressed, approveCopy(seedState.campaigns[0].copy, '2026-10-05T17:00:00Z'))).toBe(false);
  });
});
