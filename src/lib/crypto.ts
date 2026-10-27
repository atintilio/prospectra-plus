import { createHash, randomBytes, scrypt as scryptCb, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts[0] === 'scrypt' && parts.length === 6) {
    // formato do v1: scrypt$N$r$p$salt$derived (base64url)
    const [, n, r, p, salt, derived] = parts;
    const expectedLegacy = Buffer.from(derived, 'base64url');
    const actualLegacy = scryptSync(password, salt, expectedLegacy.length, { N: Number(n), r: Number(r), p: Number(p) });
    return actualLegacy.length === expectedLegacy.length && timingSafeEqual(actualLegacy, expectedLegacy);
  }
  const [algo, saltB64, keyB64] = parts;
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
