import type { CampaignTask, ProspectraState } from '../../../src/types.js';

export type LeadEvaluation = { accountId: string; qualityScore: number; ready: boolean; missing: string[]; nextAction: string };
export type TaskEvaluation = { taskId: string; ready: boolean; reason: string };

function evaluateAccount(state: ProspectraState, account: ProspectraState['accounts'][number]): LeadEvaluation {
  if (account.suppressed) return { accountId: account.id, qualityScore: 0, ready: false, missing: ['Oposição registrada'], nextAction: 'Não contatar: oposição registrada.' };
  const missing: string[] = [];
  const reviewed = account.contacts.some(contact => contact.status === 'Revisado');
  const evidence = account.evidence.some(item => item.verified);
  if (!reviewed) missing.push('Contato revisado');
  if (!evidence) missing.push('Evidência verificada');
  if (!account.domain) missing.push('Domínio da empresa');
  const qualityScore = Math.max(0, Math.min(100, (account.domain ? 25 : 0) + (reviewed ? 35 : 0) + (evidence ? 40 : 0)));
  return { accountId: account.id, qualityScore, ready: missing.length === 0 && !account.paused, missing, nextAction: account.paused ? 'Aguardar revisão: conta pausada.' : missing.length ? 'Completar dados e verificar evidências antes do contato.' : 'Pronta para revisão de copy.' };
}

function evaluateTask(state: ProspectraState, task: CampaignTask): TaskEvaluation {
  const campaign = state.campaigns.find(item => item.tasks.some(candidate => candidate.id === task.id));
  const account = state.accounts.find(item => item.id === task.accountId);
  const contact = account?.contacts.find(item => item.id === task.contactId);
  if (!campaign || !account || !contact) return { taskId: task.id, ready: false, reason: 'Conta, contato ou campanha não encontrados.' };
  if (account.paused || account.suppressed) return { taskId: task.id, ready: false, reason: 'Conta pausada ou suprimida.' };
  if (campaign.copy.state !== 'Aprovado' || !task.approval || task.approval.copyRevision !== campaign.copy.revision || task.approval.contactId !== contact.id || task.approval.channel !== task.channel) return { taskId: task.id, ready: false, reason: 'Copy, destinatário ou canal exigem nova aprovação.' };
  const verified = task.approval.evidenceIds.every(id => account.evidence.some(item => item.id === id && item.verified));
  return { taskId: task.id, ready: verified && task.approval.evidenceIds.length > 0, reason: verified ? 'Aprovação e evidências válidas.' : 'A tarefa exige evidências verificadas.' };
}

export function evaluateWorkspace(state: ProspectraState) {
  return { engine: 'rules-v1' as const, generatedAt: new Date().toISOString(), accounts: state.accounts.map(account => evaluateAccount(state, account)), tasks: state.campaigns.flatMap(campaign => campaign.tasks.map(task => evaluateTask(state, task))) };
}
