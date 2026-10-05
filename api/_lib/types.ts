export type UserRole = 'admin' | 'leader' | 'member';

export interface ApiRequest {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
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
  resets: PasswordReset[];
}
