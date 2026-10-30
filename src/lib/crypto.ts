import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCb, scryptSync, timingSafeEqual } from 'node:crypto';
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

// Sessões/credenciais (ex.: LinkedIn) são guardadas cifradas com AES-256-GCM.
// A chave deriva de SECRETS_KEY; um segredo não configurado bloqueia a de/criptografia.
const SECRET_KEY_NAME = 'SECRETS_KEY';

function secretsKey(): Buffer {
  const secret = process.env[SECRET_KEY_NAME]?.trim() || process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error('SECRETS_KEY_NOT_CONFIGURED');
  return scryptSync(secret, 'prospectra:session-secret', 32);
}

export function secretsConfigured(): boolean {
  return Boolean(process.env[SECRET_KEY_NAME]?.trim() || process.env.AUTH_SECRET?.trim());
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretsKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1gcm.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ct.toString('base64url')}`;
}

export function decryptSecret(blob: string | null | undefined): string | null {
  if (!blob) return null;
  const [version, ivB64, tagB64, ctB64] = blob.split('.');
  if (version !== 'v1gcm' || !ivB64 || !tagB64 || !ctB64) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', secretsKey(), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
