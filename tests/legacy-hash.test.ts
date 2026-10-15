import { randomBytes, scryptSync } from 'node:crypto';
import { expect, test } from 'vitest';
import { verifyPassword } from '../src/lib/crypto';

test('aceita hash scrypt do v1', async () => {
  const salt = randomBytes(16).toString('base64url');
  const d = scryptSync('Senha-Antiga-123', salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64url');
  const h = `scrypt$16384$8$1$${salt}$${d}`;
  expect(await verifyPassword('Senha-Antiga-123', h)).toBe(true);
  expect(await verifyPassword('errada', h)).toBe(false);
});
