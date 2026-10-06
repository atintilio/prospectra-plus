import { get, put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import { digestToken, randomToken } from './crypto.js';
import type { ApiRequest, ApiResponse, BridgeDevice, BridgeStore, BridgeTaskRecord, StoredUser } from './types.js';
import { header, json, parseBody } from './http.js';
import { loadAuthStore } from './db.js';

const PATH = 'prospectra/abridge.json';

function requireStorage() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BRIDGE_STORAGE_NOT_CONFIGURED');
}

function emptyStore(): BridgeStore { return { version: 1, devices: [], tasks: [] }; }

export async function loadBridgeStore(): Promise<BridgeStore> {
  requireStorage();
  const blob = await get(PATH, { access: 'private', useCache: false });
  if (!blob) return emptyStore();
  try {
    const parsed = JSON.parse(await new Response(blob.stream).text()) as Partial<BridgeStore>;
    return { version: 1, devices: Array.isArray(parsed.devices) ? parsed.devices : [], tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [] };
  } catch { throw new Error('BRIDGE_STORAGE_INVALID'); }
}

export async function saveBridgeStore(store: BridgeStore): Promise<void> {
  requireStorage();
  await put(PATH, JSON.stringify({ ...store, version: 1 }), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 0 });
}

export function redactDevice(device: BridgeDevice) {
  const { tokenHash: _tokenHash, ...safe } = device;
  return safe;
}

export async function createBridgeDevice(user: StoredUser, name: string) {
  const token = randomToken(32);
  const now = new Date().toISOString();
  const device: BridgeDevice = { id: randomUUID(), userId: user.id, name: name.trim().slice(0, 100) || 'Abridge local', tokenHash: digestToken(token), createdAt: now, updatedAt: now, active: true };
  const store = await loadBridgeStore();
  store.devices.push(device);
  await saveBridgeStore(store);
  return { device: redactDevice(device), token };
}

export async function requireBridgeDevice(req: ApiRequest, res: ApiResponse) {
  const deviceId = header(req, 'x-abridge-device-id');
  const authorization = header(req, 'authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!deviceId || !token) { json(res, 401, { error: 'bridge_not_authenticated' }); return null; }
  const [store, auth] = await Promise.all([loadBridgeStore(), loadAuthStore()]);
  const device = store.devices.find((entry) => entry.id === deviceId && entry.active && entry.tokenHash === digestToken(token));
  if (!device) { json(res, 401, { error: 'bridge_not_authenticated' }); return null; }
  const user = auth.users.find((entry) => entry.id === device.userId && entry.active);
  if (!user) { json(res, 401, { error: 'bridge_owner_inactive' }); return null; }
  return { store, device, user };
}

export function safeTask(body: Record<string, unknown>, userId: string): BridgeTaskRecord | null {
  const action = body.action;
  if (!['sync_profile', 'sync_org_chart', 'sync_inbox', 'send_connection', 'send_message'].includes(String(action))) return null;
  const profileUrl = typeof body.profileUrl === 'string' ? body.profileUrl.trim() : undefined;
  const profileUrls = Array.isArray(body.profileUrls) ? body.profileUrls.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean).slice(0, 50) : undefined;
  const companyName = typeof body.companyName === 'string' ? body.companyName.trim().slice(0, 160) : undefined;
  const postCount = typeof body.postCount === 'number' ? Math.max(0, Math.min(5, Math.floor(body.postCount))) : undefined;
  const threadUrl = typeof body.threadUrl === 'string' ? body.threadUrl.trim() : undefined;
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 5000) : undefined;
  if (action === 'sync_org_chart' && (!companyName || !profileUrls?.length)) return null;
  if (action !== 'sync_org_chart' && action !== 'sync_inbox' && !profileUrl) return null;
  if (action === 'sync_inbox' && !threadUrl) return null;
  if ((action === 'send_connection' || action === 'send_message') && !message) return null;
  if (profileUrl && !isLinkedInPath(profileUrl, '/in/')) return null;
  if (profileUrls && (profileUrls.length === 0 || profileUrls.some((value) => !isLinkedInPath(value, '/in/')))) return null;
  if (threadUrl && !isLinkedInPath(threadUrl, '/messaging/thread/')) return null;
  return { id: randomUUID(), userId, action: action as BridgeTaskRecord['action'], profileUrl, profileUrls, companyName, postCount, threadUrl, message, requestedAt: new Date().toISOString(), state: 'queued', requiresConfirmation: action === 'send_connection' || action === 'send_message', ...(typeof body.deviceId === 'string' ? { deviceId: body.deviceId } : {}), ...(typeof body.campaignTaskId === 'string' ? { campaignTaskId: body.campaignTaskId } : {}), ...(typeof body.accountId === 'string' ? { accountId: body.accountId } : {}), ...(typeof body.contactId === 'string' ? { contactId: body.contactId } : {}) };
}

function isLinkedInPath(value: string, prefix: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.linkedin.com' && url.pathname.startsWith(prefix);
  } catch { return false; }
}

export function requestBody(req: ApiRequest) { return parseBody(req); }
