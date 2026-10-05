import type { Account, CopyReview } from './types';

export function reviseCopy(copy: CopyReview, nextText: string): CopyReview {
  if (nextText.trim() === copy.text.trim()) return copy;
  return { text: nextText, revision: copy.revision + 1, state: 'Invalidado' };
}

export function approveCopy(copy: CopyReview, approvedAt: string): CopyReview {
  if (!copy.text.trim()) throw new Error('COPY_REQUIRED');
  return { ...copy, state: 'Aprovado', approvedAt };
}

export function pauseAfterReply(account: Account): Account {
  if (account.suppressed) return account;
  return { ...account, paused: true };
}

export function suppressAccount(account: Account): Account {
  return { ...account, paused: true, suppressed: true };
}

export function canCreateAssistedTask(account: Account, copy: CopyReview): boolean {
  return !account.paused && !account.suppressed && copy.state === 'Aprovado';
}
