import type { Account } from './types';

// Do not merge two distinct known establishments on a shared trading name/domain.
export function findImportedAccount(accounts: Account[], identity: { cnpj: string; domain: string; name: string }): Account | undefined {
  const byCnpj = identity.cnpj ? accounts.find((account) => account.cnpj === identity.cnpj) : undefined;
  if (byCnpj) return byCnpj;
  return accounts.find((account) => (!identity.cnpj || !account.cnpj) &&
    ((identity.domain && account.domain.toLowerCase() === identity.domain.toLowerCase()) ||
      account.name.toLowerCase() === identity.name.toLowerCase()));
}
