import { createHash } from 'node:crypto';
import { BlobPreconditionFailedError, get, put } from '@vercel/blob';

const MAX_FAILURES = 4;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
type AttemptState = { failures: number; firstFailedAt: number; lockedUntil: number };

function path(email: string, demo: boolean): string {
  const key = createHash('sha256').update(`${demo ? 'demo' : 'production'}:${email.toLowerCase()}`).digest('hex');
  return `prospectra/login-attempts/${key}.json`;
}

async function read(email: string, demo: boolean): Promise<{ state: AttemptState; etag?: string }> {
  const blob = await get(path(email, demo), { access: 'private', useCache: false });
  if (!blob) return { state: { failures: 0, firstFailedAt: 0, lockedUntil: 0 } };
  const data = JSON.parse(await new Response(blob.stream).text()) as Partial<AttemptState>;
  return { state: {
    failures: Number.isInteger(data.failures) && Number(data.failures) >= 0 ? Number(data.failures) : 0,
    firstFailedAt: Number(data.firstFailedAt) || 0,
    lockedUntil: Number(data.lockedUntil) || 0,
  }, etag: blob.blob.etag };
}

async function update(email: string, demo: boolean, change: (state: AttemptState) => AttemptState): Promise<AttemptState> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { state, etag } = await read(email, demo);
    const next = change(state);
    try {
      await put(path(email, demo), JSON.stringify(next), {
        access: 'private', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 0,
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      });
      return next;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError || (error instanceof Error && /already exists|precondition/i.test(error.message))) continue;
      throw error;
    }
  }
  throw new Error('LOGIN_LOCK_CONTENTION');
}

export async function loginLockStatus(email: string, demo: boolean): Promise<number> {
  const { state } = await read(email, demo);
  return Math.max(0, state.lockedUntil - Date.now());
}

export async function recordFailedLogin(email: string, demo: boolean): Promise<{ failures: number; lockedForMs: number }> {
  const state = await update(email, demo, (current) => {
    const now = Date.now();
    if (current.lockedUntil > now) return current;
    const failures = current.firstFailedAt && now - current.firstFailedAt < WINDOW_MS ? current.failures + 1 : 1;
    return { failures, firstFailedAt: failures === 1 ? now : current.firstFailedAt, lockedUntil: failures >= MAX_FAILURES ? now + LOCK_MS : 0 };
  });
  return { failures: state.failures, lockedForMs: Math.max(0, state.lockedUntil - Date.now()) };
}

export async function clearLoginFailures(email: string, demo: boolean): Promise<void> {
  await update(email, demo, () => ({ failures: 0, firstFailedAt: 0, lockedUntil: 0 }));
}
