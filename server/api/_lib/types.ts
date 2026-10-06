export type UserRole = 'admin' | 'leader' | 'member';
export type TeamColor = 'purple' | 'emerald' | 'lilac';

export interface ApiRequest {
  method?: string;
  url?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string | string[]): ApiResponse;
  end(body?: string): void;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  teamId?: string;
}

export interface StoredUser extends AuthUser {
  passwordHash: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredTeam {
  id: string;
  name: string;
  leaderId: string;
  memberIds: string[];
  color: TeamColor;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordReset {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface AuthStore {
  version: 1;
  users: StoredUser[];
  teams: StoredTeam[];
  resets: PasswordReset[];
}

export interface BridgeDevice {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
  lastStatus?: string;
  lastPlatform?: string;
  active: boolean;
}

export interface BridgeTaskRecord {
  id: string;
  deviceId?: string;
  userId: string;
  action: 'sync_profile' | 'sync_org_chart' | 'sync_inbox' | 'send_connection' | 'send_message' | 'send_whatsapp';
  profileUrl?: string;
  profileUrls?: string[];
  companyName?: string;
  postCount?: number;
  threadUrl?: string;
  phone?: string;
  optIn?: boolean;
  message?: string;
  requestedAt: string;
  leasedAt?: string;
  completedAt?: string;
  state: 'queued' | 'leased' | 'success' | 'failed' | 'skipped';
  requiresConfirmation: boolean;
  campaignTaskId?: string;
  accountId?: string;
  contactId?: string;
  result?: Record<string, unknown>;
}

export interface BridgeStore {
  version: 1;
  devices: BridgeDevice[];
  tasks: BridgeTaskRecord[];
}
