import { get, put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import { digestToken, randomToken } from './crypto.js';
import type { ApiRequest, ApiResponse, BridgeDevice, BridgeStore, BridgeTaskRecord, StoredUser } from './types.js';
import { header, json, parseBody } from './http.js';
import { loadAuthStore } from './db.js';

const PATH = 'prospectra/abridge.json';

function requireStorage() { if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BRIDGE_STORAGE_NOT_CONFIGURED'); }
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

export function redactDevice(device: BridgeDevice) { const { tokenHash: _tokenHash, ...safe } = device; return safe; }

export async function createBridgeDevice(user: StoredUser, name: string) {
  const token = randomToken(32);
  const now = new Date().toISOString();
  const device: BridgeDevice = { id: randomUUID(), userId: user.id, name: name.trim().slice(0, 100) || 'Abridge local', tokenHash: digestToken(token), createdAt: now, updatedAt: now, active: true };
  const store = await loadBridgeStore(); store.devices.push(device); await saveBridgeStore(store); return { device: redactDevice(device), token };
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
  if (user.workspaceMode === 'demo') { json(res, 403, { error: 'demo_external_actions_disabled' }); return null; }
  return { store, device, user };
}

export function normalizeLinkedInProfileUrl(value: string): string | null { return normalizeLinkedInUrl(value, '/in/'); }
export function normalizeLinkedInThreadUrl(value: string): string | null { return normalizeLinkedInUrl(value, '/messaging/thread/'); }
function normalizeLinkedInUrl(value: string, prefix: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || (host !== 'www.linkedin.com' && host !== 'linkedin.com') || !url.pathname.startsWith(prefix)) return null;
    const pathname = `${url.pathname.replace(/\/+$/, '')}/`;
    return `https://www.linkedin.com${pathname}`;
  } catch { return null; }
}

export function safeTask(body: Record<string, unknown>, userId: string): BridgeTaskRecord | null {
  const action = body.action;
  if (!['sync_profile', 'sync_org_chart', 'sync_inbox', 'send_connection', 'send_message', 'send_whatsapp'].includes(String(action))) return null;
  const rawProfileUrl = typeof body.profileUrl === 'string' ? body.profileUrl.trim() : undefined;
  const rawProfileUrls = Array.isArray(body.profileUrls) ? body.profileUrls.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean).slice(0, 50) : undefined;
  const profileUrl = rawProfileUrl ? normalizeLinkedInProfileUrl(rawProfileUrl) ?? undefined : undefined;
  const profileUrls = rawProfileUrls?.map((value) => normalizeLinkedInProfileUrl(value)).filter((value): value is string => Boolean(value));
  const companyName = typeof body.companyName === 'string' ? body.companyName.trim().slice(0, 160) : undefined;
  const postCount = typeof body.postCount === 'number' ? Math.max(0, Math.min(5, Math.floor(body.postCount))) : undefined;
  const rawThreadUrl = typeof body.threadUrl === 'string' ? body.threadUrl.trim() : undefined;
  const threadUrl = rawThreadUrl ? normalizeLinkedInThreadUrl(rawThreadUrl) ?? undefined : undefined;
  const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '').slice(0, 15) : undefined;
  const optIn = body.optIn === true;
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 5000) : undefined;
  const campaignTaskId = typeof body.campaignTaskId === 'string' ? body.campaignTaskId : undefined;
  if (action === 'sync_org_chart' && (!companyName || !profileUrls?.length || profileUrls.length !== rawProfileUrls?.length)) return null;
  if (action !== 'sync_org_chart' && action !== 'sync_inbox' && !profileUrl) return null;
  if (action === 'sync_inbox' && !threadUrl) return null;
  if ((action === 'send_connection' || action === 'send_message') && (!message || !campaignTaskId)) return null;
  if (action === 'send_whatsapp' && (!phone || phone.length < 10 || !message || !campaignTaskId || !optIn)) return null;
  if (rawProfileUrls && (!profileUrls || profileUrls.length !== rawProfileUrls.length)) return null;
  return { id: randomUUID(), userId, action: action as BridgeTaskRecord['action'], profileUrl, profileUrls, companyName, postCount, threadUrl, phone, optIn, message, requestedAt: new Date().toISOString(), state: 'queued', requiresConfirmation: action === 'send_connection' || action === 'send_message' || action === 'send_whatsapp', ...(typeof body.deviceId === 'string' ? { deviceId: body.deviceId } : {}), ...(campaignTaskId ? { campaignTaskId } : {}), ...(typeof body.accountId === 'string' ? { accountId: body.accountId } : {}), ...(typeof body.contactId === 'string' ? { contactId: body.contactId } : {}) };
}

export function requestBody(req: ApiRequest) { return parseBody(req); }
