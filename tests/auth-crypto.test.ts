import { describe, expect, it } from 'vitest';
import { hashPassword, validatePassword, verifyPassword } from '../api/_lib/crypto';

describe('segurança de autenticação', () => {
  it('armazena apenas um hash verificável e não a senha original', () => {
    const encoded = hashPassword('ProspectraSeguro2026');
    expect(encoded).not.toContain('ProspectraSeguro2026');
    expect(verifyPassword('ProspectraSeguro2026', encoded)).toBe(true);
    expect(verifyPassword('outraSenha2026', encoded)).toBe(false);
  });

  it('exige senha longa e combinação mínima', () => {
    expect(validatePassword('curta')).not.toBeNull();
    expect(validatePassword('semnumeroaqui')).not.toBeNull();
    expect(validatePassword('ProspectraSeguro2026')).toBeNull();
  });
});
