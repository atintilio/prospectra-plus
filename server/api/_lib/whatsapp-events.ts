import { mutateWorkspaceState } from './workspace.js';
import type { AuthUser } from './types.js';

export async function recordWhatsAppReply(input: { user?: AuthUser; eventId: string; from: string; text?: string; actor: string }) {
  const number = input.from.replace(/\D/g, '');
  if (!number) return [];
  const activityId = `whatsapp-reply-${input.eventId}`;
  let accountIds: string[] = [];
  await mutateWorkspaceState(input.user, (state) => {
    const matches = state.accounts.filter((account) => account.contacts.some((contact) => contact.phone?.replace(/\D/g, '') === number));
    accountIds = matches.map((account) => account.id);
    if (!matches.length || matches.every((account) => account.activities.some((activity) => activity.id === activityId))) return null;
    const now = new Date().toISOString();
    for (const account of matches) {
      account.paused = true;
      if (!account.activities.some((activity) => activity.id === activityId)) account.activities.unshift({ id: activityId, kind: 'Resposta', actor: input.actor, createdAt: now, text: `Resposta recebida no WhatsApp${input.text ? `: ${input.text.slice(0, 2000)}` : '.'} Conta e tarefas pendentes pausadas para revisão.` });
    }
    for (const campaign of state.campaigns) for (const task of campaign.tasks) {
      if (accountIds.includes(task.accountId) && task.state !== 'Concluído') task.state = 'Pausado';
    }
    return state;
  });
  return accountIds;
}

export async function recordWhatsAppDelivery(messageId: string, status: 'sent' | 'delivered' | 'read', user?: AuthUser) {
  const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
  let matched = false;
  await mutateWorkspaceState(user, (state) => {
    let changed = false;
    for (const campaign of state.campaigns) for (const task of campaign.tasks) {
      if (task.providerMessageId !== messageId) continue;
      matched = true;
      if ((rank[task.providerStatus ?? ''] ?? 0) >= rank[status]) continue;
      task.providerStatus = status;
      changed = true;
    }
    return changed ? state : null;
  });
  return matched;
}
