import { loadAuthStore } from './db.js';
import { header, json, publicOrigin } from './http.js';
import { readSession } from './session.js';
import type { ApiRequest, ApiResponse, AuthStore, StoredUser } from './types.js';

export interface OwnerContext {
  store: AuthStore;
  user: StoredUser;
}

export async function requireOwner(req: ApiRequest, res: ApiResponse): Promise<OwnerContext | null> {
  const session = readSession(req);
  if (!session) {
    json(res, 401, { error: 'not_authenticated' });
    return null;
  }
  const store = await loadAuthStore();
  const user = store.users.find((entry) => entry.id === session.id && entry.active);
  if (!user) {
    json(res, 401, { error: 'not_authenticated' });
    return null;
  }
  if (user.role !== 'admin') {
    json(res, 403, { error: 'owner_access_required' });
    return null;
  }
  return { store, user };
}

export function requireSameOrigin(req: ApiRequest, res: ApiResponse): boolean {
  const origin = header(req, 'origin');
  if (!origin) return true;
  try {
    const expected = new URL(publicOrigin(req)).origin;
    if (origin !== expected) {
      json(res, 403, { error: 'invalid_request_origin' });
      return false;
    }
    return true;
  } catch {
    json(res, 403, { error: 'invalid_request_origin' });
    return false;
  }
}
