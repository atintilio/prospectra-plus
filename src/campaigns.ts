import type { Account, Campaign } from './types';

export interface CampaignDraft { name: string; icp: string; accountIds: string[] }

// Creation prepares a reviewable draft. It never creates approved tasks or sends messages.
export function createCampaignDraft(draft: CampaignDraft, accounts: Account[], id: string): Campaign {
  const name = draft.name.trim();
  const icp = draft.icp.trim();
  if (!name || name.length > 100 || !icp || icp.length > 500 || !id) throw new Error('CAMPAIGN_DRAFT_INVALID');
  const eligibleIds = new Set(accounts.filter((account) => !account.paused && !account.suppressed).map((account) => account.id));
  const accountIds = [...new Set(draft.accountIds)];
  if (!accountIds.length || accountIds.some((accountId) => !eligibleIds.has(accountId))) throw new Error('CAMPAIGN_ACCOUNTS_INVALID');
  return { id, name, icp, accounts: accountIds, status: 'Em revisão', copy: { text: '', revision: 1, state: 'Rascunho' }, tasks: [] };
}
