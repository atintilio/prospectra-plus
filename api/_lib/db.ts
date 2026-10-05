import { get, put } from '@vercel/blob';
import type { AuthStore } from './types';

const AUTH_PATH = 'prospectra/auth.json';
let readPromise: Promise<AuthStore> | undefined;

function requireStorage() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('AUTH_STORAGE_NOT_CONFIGURED');
}

function emptyStore(): AuthStore {
  return { version: 1, users: [], resets: [] };
}

export async function loadAuthStore(): Promise<AuthStore> {
  requireStorage();
  const blob = await get(AUTH_PATH, { access: 'private', useCache: false });
  if (!blob) return emptyStore();
  const text = await new Response(blob.stream).text();
  try {
    const parsed = JSON.parse(text) as Partial<AuthStore>;
    return { version: 1, users: Array.isArray(parsed.users) ? parsed.users : [], resets: Array.isArray(parsed.resets) ? parsed.resets : [] };
  } catch {
    throw new Error('AUTH_STORAGE_INVALID');
  }
}

export async function saveAuthStore(store: AuthStore): Promise<void> {
  requireStorage();
  await put(AUTH_PATH, JSON.stringify(store), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
}

export async function readAuthStoreOnce(): Promise<AuthStore> {
  if (!readPromise) readPromise = loadAuthStore().finally(() => { readPromise = undefined; });
  return readPromise;
}
