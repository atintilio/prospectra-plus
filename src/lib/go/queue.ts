import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import type { DB } from '@/db';
import * as schema from '@/db/schema';
import { GoClient, goConfig, type GoAction, type GoActionType, type GoEnqueuer } from './client';

// Entrega ao Go as ações pendentes das campanhas cujo executor tem uma conta LinkedIn
// real conectada. É idempotente: ao enfileirar, o actionId é gravado em action.providerId,
// então a mesma ação nunca é empurrada duas vezes. O resultado volta pelo webhook /api/dispatch.

const PUSHABLE: GoActionType[] = ['invite', 'message', 'comment', 'react'];

export function goWebhookUrl(): string {
  const base = (process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/dispatch`;
}

export async function pushDueActionsToGo(
  db: DB,
  opts: { orgId?: string; limit?: number; client?: GoEnqueuer; webhookUrl?: string } = {},
): Promise<{ pushed: number; skipped: number; failed: number }> {
  const config = goConfig();
  if (!opts.client && !config) return { pushed: 0, skipped: 0, failed: 0 };
  const client: GoEnqueuer = opts.client ?? new GoClient(config!);
  const webhookUrl = opts.webhookUrl ?? goWebhookUrl();

  const conds = [
    eq(schema.actions.status, 'pending'),
    eq(schema.actions.dispatchState, 'none'),
    isNull(schema.actions.providerId),
  ];
  if (opts.orgId) conds.push(eq(schema.actions.orgId, opts.orgId));

  // innerJoin na conta via campaigns.linkedin_account_id: campanhas sem conta vinculada não entram.
  const rows = await db.select({ action: schema.actions, lead: schema.leads, account: schema.linkedinAccounts })
    .from(schema.actions)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.actions.leadId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.actions.campaignId))
    .innerJoin(schema.linkedinAccounts, eq(schema.linkedinAccounts.id, schema.campaigns.linkedinAccountId))
    .where(and(...conds))
    .limit(opts.limit ?? 100);

  let pushed = 0, skipped = 0, failed = 0;
  for (const { action, lead, account } of rows) {
    // Demo, conta não conectada ou sem provedor nunca toca a rede real.
    if (!PUSHABLE.includes(action.type as GoActionType) || account.demo || account.status !== 'connected' || !account.providerId) {
      skipped++; continue;
    }
    const go: GoAction = {
      actionId: action.id, contaId: account.providerId, tipo: action.type as GoActionType,
      profileUrl: lead.linkedinUrl, texto: action.body,
    };
    try {
      const { tarefaId } = await client.enqueue(go, webhookUrl);
      // Grava o id da tarefa e marca a ação como entregue (não reempurra). Só o webhook conclui.
      const marked = await db.update(schema.actions).set({ providerId: tarefaId })
        .where(and(eq(schema.actions.id, action.id), isNull(schema.actions.providerId)))
        .returning({ id: schema.actions.id });
      if (marked.length) pushed++; else skipped++;
    } catch {
      failed++; // permanece pendente para nova tentativa no próximo ciclo; sem reenvio cego.
    }
  }
  return { pushed, skipped, failed };
}
