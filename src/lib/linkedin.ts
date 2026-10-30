import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { DB } from '@/db';
import * as schema from '@/db/schema';
import { decryptSecret, encryptSecret, newToken, secretsConfigured } from './crypto';

// Núcleo do Go LinkedIn.
// - Cada usuário opera (por enquanto) uma conta LinkedIn, sempre vinculada a orgId + userId.
// - A sessão/token nunca fica em texto puro: é cifrada com AES-256-GCM antes de tocar o banco.
// - Na organização de demonstração nada toca a rede: conexão, teste e envio são todos simulados.

export type AccountRow = typeof schema.linkedinAccounts.$inferSelect;

export const STATUS_LABEL: Record<schema.LinkedInStatus, string> = {
  waiting: 'Aguardando conexão',
  connected: 'Conectada',
  expired: 'Sessão expirada',
  blocked: 'Bloqueada pelo LinkedIn',
  disconnected: 'Desconectada',
};

export function envFlag(...names: string[]): boolean {
  return names.some((n) => process.env[n]?.trim().toLowerCase() === 'true');
}

/**
 * Valida uma sessão do LinkedIn em produção: uma requisição com o cookie da sessão.
 * 200 => conectada; redireciono para login => sessão expirada; 403/429 => bloqueada.
 * Nunca chama a rede na demo.
 */
export async function verifyLinkedInSession(sessionValue: string): Promise<schema.LinkedInStatus | 'ok'> {
  let res: Response;
  try {
    res = await fetch('https://www.linkedin.com/', {
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36', cookie: sessionValue },
      redirect: 'follow',
    });
  } catch {
    return 'expired'; // rede indisponível não pode "conectar" a conta
  }
  if (res.url.includes('login') || res.status === 302) return 'expired';
  if (res.status === 403 || res.status === 429) return 'blocked';
  if (res.ok) return 'ok';
  return 'expired';
}

export async function getMyAccount(db: DB, orgId: string, userId: string): Promise<AccountRow | undefined> {
  const [row] = await db.select().from(schema.linkedinAccounts)
    .where(and(eq(schema.linkedinAccounts.orgId, orgId), eq(schema.linkedinAccounts.userId, userId)))
    .limit(1);
  return row ?? undefined;
}

export async function listAccounts(db: DB, orgId: string, userId: string): Promise<AccountRow[]> {
  return db.select().from(schema.linkedinAccounts)
    .where(and(eq(schema.linkedinAccounts.orgId, orgId), eq(schema.linkedinAccounts.userId, userId)));
}

type ConnectInput = { session?: string };

/** Conecta (ou registra) a conta do usuário. Na demo, tudo é simulado. */
export async function connectAccount(db: DB, orgId: string, userId: string, isDemo: boolean, input: ConnectInput = {}): Promise<{ account: AccountRow; message: string }> {
  const hasSession = Boolean(input.session?.trim());
  if (hasSession) {
    if (!secretsConfigured() && !isDemo) throw new Error('SECRETS_KEY_NOT_CONFIGURED');
  }
  const existing = await getMyAccount(db, orgId, userId);
  const sessionEnc = hasSession ? encryptSecret(input.session!.trim()) : existing?.sessionEnc ?? null;

  if (isDemo) {
    // Demo: simula conexão completa, sem rede e sem sessão real.
    const values = {
      orgId, userId, status: 'connected' as const, demo: true,
      providerId: existing?.providerId ?? `demo-${newToken().slice(0, 12)}`,
      sessionEnc: sessionEnc ?? encryptSecret('demo-session'),
      connectedAt: new Date(), lastError: null,
    };
    if (existing) {
      const [account] = await db.update(schema.linkedinAccounts).set(values).where(eq(schema.linkedinAccounts.id, existing.id)).returning();
      return { account, message: 'Conexão simulada concluída (demo).' };
    }
    const [account] = await db.insert(schema.linkedinAccounts).values(values).returning();
    return { account, message: 'Conexão simulada concluída (demo).' };
  }

  // Produção: com sessão informada, valida na hora; sem sessão, fica "aguardando".
  let status: schema.LinkedInStatus = 'waiting';
  let lastError: string | null = null;
  let connectedAt: Date | null = null;
  if (hasSession) {
    const check = await verifyLinkedInSession(input.session!.trim());
    status = check === 'ok' ? 'connected' : check;
    lastError = check === 'ok' ? null : `Teste inicial: sessão ${check === 'blocked' ? 'bloqueada' : 'inválida'}.`;
    connectedAt = check === 'ok' ? new Date() : null;
  }
  const values = { orgId, userId, status, sessionEnc, lastError, connectedAt, demo: false, lastCheckedAt: connectedAt };
  if (existing) {
    const [account] = await db.update(schema.linkedinAccounts).set(values).where(eq(schema.linkedinAccounts.id, existing.id)).returning();
    return { account, message: status === 'connected' ? 'Conta conectada.' : 'Sessão registrada, mas o teste não confirmou conexão.' };
  }
  const [account] = await db.insert(schema.linkedinAccounts).values(values).returning();
  return { account, message: status === 'connected' ? 'Conta conectada.' : 'Conta registrada: aguardando teste de conexão.' };
}

/** Desconecta: limpa a sessão e o vínculo com o provedor. */
export async function disconnectAccount(db: DB, orgId: string, userId: string): Promise<AccountRow | undefined> {
  const existing = await getMyAccount(db, orgId, userId);
  if (!existing) return undefined;
  const [account] = await db.update(schema.linkedinAccounts)
    .set({ status: 'disconnected', sessionEnc: null, providerId: null, demo: false, connectedAt: null, lastError: null })
    .where(eq(schema.linkedinAccounts.id, existing.id)).returning();
  return account;
}

/**
 * Testa a conta. Demo nunca toca a rede. Produção sem sessão sinaliza o próximo passo.
 * Retorna o estado atualizado da conta (emoção: connected/expired/blocked mantida no banco).
 */
export async function testAccount(db: DB, orgId: string, userId: string, isDemo: boolean): Promise<{ account: AccountRow | undefined; ok: boolean; message: string }> {
  const existing = await getMyAccount(db, orgId, userId);
  if (!existing) return { account: undefined, ok: false, message: 'Nenhuma conta cadastrada ainda.' };
  const now = new Date();
  if (existing.demo || isDemo) {
    // Demo: conta simulação recém-conectada segue saudável; nada de rede.
    const status: schema.LinkedInStatus = existing.status === 'disconnected' ? 'disconnected' : existing.status === 'blocked' || existing.status === 'expired' ? 'connected' : existing.status;
    const [account] = await db.update(schema.linkedinAccounts).set({ lastCheckedAt: now, status, lastError: null }).where(eq(schema.linkedinAccounts.id, existing.id)).returning();
    return { account, ok: status === 'connected', message: status === 'connected' ? 'Simulação: sessão válida.' : `Simulação: conta ${STATUS_LABEL[status]}.` };
  }
  const session = decryptSecret(existing.sessionEnc);
  if (!session) {
    const [account] = await db.update(schema.linkedinAccounts)
      .set({ lastCheckedAt: now, status: existing.sessionEnc ? 'expired' : existing.status, lastError: existing.sessionEnc ? 'Sessão ilegível: reconecte a conta.' : existing.lastError })
      .where(eq(schema.linkedinAccounts.id, existing.id)).returning();
    return { account, ok: false, message: 'Nenhuma sessão registrada ainda: informe a sessão para conectar.' };
  }
  const check = await verifyLinkedInSession(session);
  const status: schema.LinkedInStatus = check === 'ok' ? 'connected' : check;
  const [account] = await db.update(schema.linkedinAccounts)
    .set({ lastCheckedAt: now, status, lastError: check === 'ok' ? null : `Teste: sessão ${status === 'blocked' ? 'bloqueada' : 'expirada'}.`, connectedAt: check === 'ok' ? existing.connectedAt ?? now : null })
    .where(eq(schema.linkedinAccounts.id, existing.id)).returning();
  return { account, ok: check === 'ok', message: check === 'ok' ? 'Sessão válida.' : `Sessão ${STATUS_LABEL[status].toLowerCase()}.` };
}

/** Atualizações passivas de status (callbacks do worker de automação). */
export async function setAccountStatus(db: DB, accountId: string, orgId: string, status: schema.LinkedInStatus, error?: string | null): Promise<AccountRow | undefined> {
  const [account] = await db.update(schema.linkedinAccounts)
    .set({ status, lastError: error ?? null, lastCheckedAt: new Date() })
    .where(and(eq(schema.linkedinAccounts.id, accountId), eq(schema.linkedinAccounts.orgId, orgId)))
    .returning();
  return account;
}
