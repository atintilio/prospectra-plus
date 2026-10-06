import { get, put } from '@vercel/blob';

export type ProspectingProvider = 'unipile';
export type ProspectingAccountStatus = 'pending' | 'connected' | 'reconnect_required' | 'failed';

export interface ProspectingConnection {
  id: string;
  provider: ProspectingProvider;
  userId: string;
  providerAccountId?: string;
  channel: 'linkedin' | 'whatsapp';
  status: ProspectingAccountStatus;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

type ConnectionStore = { version: 1; connections: ProspectingConnection[] };
const CONNECTIONS_PATH = 'prospectra/prospecting-connections.json';

function requireStorage() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('WORKSPACE_STORAGE_NOT_CONFIGURED');
}

export async function loadProspectingConnections(): Promise<ConnectionStore> {
  requireStorage();
  const blob = await get(CONNECTIONS_PATH, { access: 'private', useCache: false });
  if (!blob) return { version: 1, connections: [] };
  const text = await new Response(blob.stream).text();
  try {
    const parsed = JSON.parse(text) as Partial<ConnectionStore>;
    if (!Array.isArray(parsed.connections)) throw new Error('PROSPECTING_CONNECTIONS_INVALID');
    return { version: 1, connections: parsed.connections };
  } catch {
    throw new Error('PROSPECTING_CONNECTIONS_INVALID');
  }
}

export async function saveProspectingConnections(store: ConnectionStore): Promise<void> {
  requireStorage();
  await put(CONNECTIONS_PATH, JSON.stringify(store), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 0 });
}

export async function markProspectingConnection(input: Omit<ProspectingConnection, 'createdAt' | 'updatedAt'>): Promise<ProspectingConnection> {
  const store = await loadProspectingConnections();
  const now = new Date().toISOString();
  const index = store.connections.findIndex((connection) => connection.provider === input.provider && connection.userId === input.userId && connection.channel === input.channel && connection.providerAccountId === input.providerAccountId);
  const next: ProspectingConnection = { ...input, createdAt: index >= 0 ? store.connections[index].createdAt : now, updatedAt: now };
  if (index >= 0) store.connections[index] = next;
  else store.connections.push(next);
  await saveProspectingConnections(store);
  return next;
}
