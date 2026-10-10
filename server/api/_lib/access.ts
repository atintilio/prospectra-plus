import { loadAuthStore } from './db.js';
import { header, json, publicOrigin } from './http.js';
import { readSession, isDemoRequest } from './session.js';
import type { ApiRequest, ApiResponse, AuthStore, StoredUser } from './types.js';

export interface ActiveSessionContext {
  store: AuthStore;
  user: StoredUser;
}

export interface OwnerContext extends ActiveSessionContext {}

export async function requireActiveSession(req: ApiRequest, res: ApiResponse): Promise<ActiveSessionContext | null> {
  const session = readSession(req);
  if (!session) {
    json(res, 401, { error: 'not_authenticated' });
    return null;
  }
  const store = await loadAuthStore();
  const user = store.users.find((entry) => entry.id === session.id && entry.active && (entry.workspaceMode === 'demo') === isDemoRequest(req) && (entry.sessionVersion ?? 0) === (session.sessionVersion ?? 0));
  if (!user) {
    json(res, 401, { error: 'not_authenticated' });
    return null;
  }
  return { store, user };
}

export async function requireOwner(req: ApiRequest, res: ApiResponse): Promise<OwnerContext | null> {
  const context = await requireActiveSession(req, res);
  if (!context) return null;
  if (context.user.role !== 'admin' || Boolean(context.user.workspaceMode)) {
    json(res, 403, { error: 'owner_access_required' });
    return null;
  }
  return context;
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
