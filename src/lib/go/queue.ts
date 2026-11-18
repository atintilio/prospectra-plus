import 'server-only';
import { and, eq, gte, isNull, isNotNull, ne, sql } from 'drizzle-orm';
import type { DB } from '@/db';
import * as schema from '@/db/schema';
import { GoClient, goConfig, type GoAction, type GoActionType, type GoEnqueuer } from './client';
import { isWithinWorkingHours, gapElapsed } from './pacing';

// Entrega ao Go as ações pendentes das campanhas cujo executor tem uma conta LinkedIn
// real conectada. É idempotente: ao enfileirar, o actionId é gravado em action.providerId,
// então a mesma ação nunca é empurrada duas vezes. O resultado volta pelo webhook /api/dispatch.
//
// Ritmo seguro: no máximo 1 ação por conta por ciclo, dentro do horário comercial da
// operação, respeitando o espaçamento mínimo e o teto semanal de convites por conta.

const PUSHABLE: GoActionType[] = ['invite', 'message', 'comment', 'react'];
const DEFAULTS = { timezone: 'America/Sao_Paulo', start: '09:00', end: '18:00', minGapMin: 30, weeklyInviteCap: 100 };

export function goWebhookUrl(): string {
  const base = (process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/dispatch`;
}

/** Última ação confirmada (enviada) desta conta — base para o espaçamento. */
async function lastSentForAccount(db: DB, accountId: string): Promise<Date | null> {
  const [r] = await db.select({ last: sql<Date | null>`max(${schema.actions.executedAt})` })
    .from(schema.actions)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.actions.campaignId))
    .where(and(eq(schema.campaigns.linkedinAccountId, accountId), eq(schema.actions.dispatchState, 'sent')));
  return r?.last ? new Date(r.last) : null;
}

/** Convites enviados nos últimos 7 dias por esta conta (teto semanal). */
async function weeklyInvitesForAccount(db: DB, accountId: string, now: Date): Promise<number> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [r] = await db.select({ n: sql<number>`count(*)` })
    .from(schema.actions)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.actions.campaignId))
    .where(and(eq(schema.campaigns.linkedinAccountId, accountId), eq(schema.actions.type, 'invite'), eq(schema.actions.dispatchState, 'sent'), gte(schema.actions.executedAt, weekAgo)));
  return Number(r?.n ?? 0);
}

/** Alguma ação já empurrada e ainda não confirmada para esta conta? (evita empilhar) */
async function hasInFlight(db: DB, accountId: string): Promise<boolean> {
  const [r] = await db.select({ n: sql<number>`count(*)` })
    .from(schema.actions)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.actions.campaignId))
    .where(and(eq(schema.campaigns.linkedinAccountId, accountId), isNotNull(schema.actions.providerId), eq(schema.actions.status, 'pending'), ne(schema.actions.dispatchState, 'sent')));
  return Number(r?.n ?? 0) > 0;
}

export async function pushDueActionsToGo(
  db: DB,
  opts: { orgId?: string; limit?: number; client?: GoEnqueuer; webhookUrl?: string; now?: Date } = {},
): Promise<{ pushed: number; skipped: number; failed: number }> {
  const config = goConfig();
  if (!opts.client && !config) return { pushed: 0, skipped: 0, failed: 0 };
  const client: GoEnqueuer = opts.client ?? new GoClient(config!);
  const webhookUrl = opts.webhookUrl ?? goWebhookUrl();
  const now = opts.now ?? new Date();

  const conds = [
    eq(schema.actions.status, 'pending'),
    eq(schema.actions.dispatchState, 'none'),
    isNull(schema.actions.providerId),
    eq(schema.campaigns.mode, 'automatico'), // só campanhas automáticas vão ao worker Go
  ];
  if (opts.orgId) conds.push(eq(schema.actions.orgId, opts.orgId));

  // innerJoin na conta via campaigns.linkedin_account_id; leftJoin nas configurações da operação (ritmo).
  const rows = await db.select({ action: schema.actions, lead: schema.leads, account: schema.linkedinAccounts, settings: schema.orgSettings })
    .from(schema.actions)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.actions.leadId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.actions.campaignId))
    .innerJoin(schema.linkedinAccounts, eq(schema.linkedinAccounts.id, schema.campaigns.linkedinAccountId))
    .leftJoin(schema.orgSettings, eq(schema.orgSettings.orgId, schema.actions.orgId))
    .where(and(...conds))
    .orderBy(schema.actions.dueDate, schema.actions.createdAt)
    .limit(opts.limit ?? 100);

  let pushed = 0, skipped = 0, failed = 0;
  const usedAccounts = new Set<string>();      // no máximo 1 ação por conta por ciclo
  const weeklyCache = new Map<string, number>();

  for (const { action, lead, account, settings } of rows) {
    // Demo, conta não conectada, sem provedor, ou lead sem LinkedIn nunca toca a rede real.
    if (!PUSHABLE.includes(action.type as GoActionType) || account.demo || account.status !== 'connected' || !account.providerId || !lead.linkedinUrl) {
      skipped++; continue;
    }
    // Uma ação por conta por ciclo (espaçamento natural entre execuções).
    if (usedAccounts.has(account.id)) { skipped++; continue; }

    const cfg = {
      timezone: settings?.timezone ?? DEFAULTS.timezone,
      start: settings?.atendimentoStart ?? DEFAULTS.start,
      end: settings?.atendimentoEnd ?? DEFAULTS.end,
      minGapMin: settings?.minActionGapMin ?? DEFAULTS.minGapMin,
      weeklyInviteCap: settings?.weeklyInviteCap ?? DEFAULTS.weeklyInviteCap,
    };

    // Fora do horário comercial da operação: não dispara.
    if (!isWithinWorkingHours(cfg, now)) { skipped++; continue; }
    // Ação em voo (empurrada e não confirmada) para esta conta: não empilha.
    if (await hasInFlight(db, account.id)) { usedAccounts.add(account.id); skipped++; continue; }
    // Espaçamento mínimo desde a última ação confirmada.
    if (!gapElapsed(await lastSentForAccount(db, account.id), cfg.minGapMin, now)) { usedAccounts.add(account.id); skipped++; continue; }
    // Teto semanal de convites por conta.
    if (action.type === 'invite') {
      let wk = weeklyCache.get(account.id);
      if (wk === undefined) { wk = await weeklyInvitesForAccount(db, account.id, now); weeklyCache.set(account.id, wk); }
      if (wk >= cfg.weeklyInviteCap) { skipped++; continue; }
    }

    const go: GoAction = {
      actionId: action.id, contaId: account.providerId, tipo: action.type as GoActionType,
      profileUrl: lead.linkedinUrl, texto: action.body,
      accountId: account.id, orgId: action.orgId, // para o Go reportar saúde da conta
    };
    try {
      const { tarefaId } = await client.enqueue(go, webhookUrl);
      const marked = await db.update(schema.actions).set({ providerId: tarefaId })
        .where(and(eq(schema.actions.id, action.id), isNull(schema.actions.providerId)))
        .returning({ id: schema.actions.id });
      if (marked.length) {
        pushed++;
        usedAccounts.add(account.id);
        if (action.type === 'invite') weeklyCache.set(account.id, (weeklyCache.get(account.id) ?? 0) + 1);
      } else skipped++;
    } catch {
      failed++; // permanece pendente para nova tentativa no próximo ciclo; sem reenvio cego.
    }
  }
  return { pushed, skipped, failed };
}
