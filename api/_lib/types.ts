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
  role: 'master' | 'operator';
}
