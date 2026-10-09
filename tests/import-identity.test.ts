import { describe, expect, it } from 'vitest';
import { findImportedAccount } from '../src/import-identity';
import { seedState } from '../src/data';

describe('identidade de empresas brasileiras importadas', () => {
  const base = { ...seedState.accounts[0], cnpj: '00000001000100', suppressed: true };
  it('reencontra CNPJ preservando o registro com oposição mesmo com nome novo', () => {
    expect(findImportedAccount([base], { cnpj: base.cnpj, name: 'Nome novo', domain: '' })).toBe(base);
  });
  it('não funde CNPJs distintos com o mesmo nome e domínio', () => {
    expect(findImportedAccount([base], { cnpj: '00000002000100', name: base.name, domain: base.domain })).toBeUndefined();
  });
  it('mantém compatibilidade com contas legadas sem CNPJ', () => {
    const legacy = { ...base, cnpj: undefined };
    expect(findImportedAccount([legacy], { cnpj: '00000002000100', name: legacy.name, domain: '' })).toBe(legacy);
  });
});
