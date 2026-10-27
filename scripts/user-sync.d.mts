export function syncUsers(query: (sql: string, params: unknown[]) => Promise<Record<string, any>[]>, users: Record<string, any>[], masterEmail?: string): Promise<number>;
