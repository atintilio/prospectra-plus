import { describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { GoClient, GoError, type GoAction, type GoEnqueuer } from '@/lib/go/client';
import { pushDueActionsToGo } from '@/lib/go/queue';
import { seedOrg, testDb } from './helpers';

const action: GoAction = { actionId: '11111111-1111-1111-1111-111111111111', contaId: 'conta-go-1', tipo: 'invite', profileUrl: 'https://www.linkedin.com/in/ana', texto: 'Oi Ana' };
const WEBHOOK = 'https://app.exemplo.com/api/dispatch';
const NOON = new Date('2026-11-18T15:00:00Z'); // 12:00 America/Sao_Paulo — dentro do horário comercial

describe('GoClient (push)', () => {
  it('envia a ação no formato do Go, com segredo e webhook', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ tarefa_id: 'go-tarefa-9', status: 'enfileirada' }), { status: 201 }));
    const client = new GoClient({ baseUrl: 'https://go.exemplo.com', secret: 's3cr3t' }, fetcher as unknown as typeof fetch);
    const { tarefaId } = await client.enqueue(action, WEBHOOK);
    expect(tarefaId).toBe('go-tarefa-9');
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://go.exemplo.com/acoes');
    expect((init!.headers as Record<string, string>)['x-go-secret']).toBe('s3cr3t');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ tarefa_id: action.actionId, conta_id: 'conta-go-1', tipo: 'invite', profile_url: action.profileUrl, texto: 'Oi Ana', webhook_url: WEBHOOK });
  });

  it('recusa URL não-HTTPS e credencial inválida', async () => {
    expect(() => new GoClient({ baseUrl: 'http://go.exemplo.com', secret: 's' })).toThrow(GoError);
    const fetcher = vi.fn(async () => new Response('no', { status: 403 }));
    const client = new GoClient({ baseUrl: 'https://go.exemplo.com', secret: 's' }, fetcher as unknown as typeof fetch);
    await expect(client.enqueue(action, WEBHOOK)).rejects.toBeInstanceOf(GoError);
  });

  it('sem confirmação (rede caiu) lança GoError', async () => {
    const fetcher = vi.fn(async () => { throw new Error('ECONN'); });
    const client = new GoClient({ baseUrl: 'https://go.exemplo.com', secret: 's' }, fetcher as unknown as typeof fetch);
    await expect(client.enqueue(action, WEBHOOK)).rejects.toBeInstanceOf(GoError);
  });
});

async function seedPending(demo = false, status: schema.LinkedInStatus = 'connected', providerId: string | null = 'conta-go-1', mode: 'assistido' | 'automatico' = 'automatico') {
  const db = await testDb();
  const { org, user } = await seedOrg(db);
  const [acc] = await db.insert(schema.linkedinAccounts).values({ orgId: org.id, userId: user.id, status, demo, providerId }).returning();
  const steps: schema.CampaignStep[] = [{ id: 's1', type: 'invite', delayDays: 0, condition: 'always', template: 'Oi', useAi: false }];
  const [camp] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, assignedTo: user.id, linkedinAccountId: acc.id, name: 'C', status: 'active', mode, steps }).returning();
  const [lead] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana', stage: 'new' }).returning();
  const [enr] = await db.insert(schema.enrollments).values({ orgId: org.id, campaignId: camp.id, leadId: lead.id, stepIndex: 0, state: 'running', nextRunAt: new Date() }).returning();
  const [act] = await db.insert(schema.actions).values({ orgId: org.id, enrollmentId: enr.id, campaignId: camp.id, leadId: lead.id, userId: user.id, stepIndex: 0, type: 'invite', body: 'Oi Ana', dueDate: '2026-11-18', status: 'pending' }).returning();
  return { db, org, user, act, camp, acc, enr };
}

const stub = (tarefaId = 'go-1'): GoEnqueuer & { calls: number } => {
  const s = { calls: 0, async enqueue() { s.calls++; return { tarefaId }; } };
  return s as unknown as GoEnqueuer & { calls: number };
};

describe('pushDueActionsToGo', () => {
  it('entrega ação pendente de conta conectada e grava o id (idempotente)', async () => {
    const { db, org, act } = await seedPending();
    const client = stub('go-tarefa-7');
    const r1 = await pushDueActionsToGo(db, { orgId: org.id, client, webhookUrl: WEBHOOK, now: NOON });
    expect(r1).toMatchObject({ pushed: 1, failed: 0 });
    const [after] = await db.select().from(schema.actions).where(eq(schema.actions.id, act.id));
    expect(after.providerId).toBe('go-tarefa-7');
    // segunda passada não reempurra (providerId já gravado)
    const r2 = await pushDueActionsToGo(db, { orgId: org.id, client, webhookUrl: WEBHOOK, now: NOON });
    expect(r2.pushed).toBe(0);
    expect(client.calls).toBe(1);
  });

  it('pula conta demo e conta não conectada (nada toca a rede real)', async () => {
    const demo = await seedPending(true);
    expect((await pushDueActionsToGo(demo.db, { orgId: demo.org.id, client: stub(), webhookUrl: WEBHOOK, now: NOON })).pushed).toBe(0);
    const off = await seedPending(false, 'expired');
    expect((await pushDueActionsToGo(off.db, { orgId: off.org.id, client: stub(), webhookUrl: WEBHOOK, now: NOON })).pushed).toBe(0);
  });

  it('falha do Go mantém a ação pendente, sem id gravado', async () => {
    const { db, org, act } = await seedPending();
    const failing: GoEnqueuer = { async enqueue() { throw new GoError('down'); } };
    const r = await pushDueActionsToGo(db, { orgId: org.id, client: failing, webhookUrl: WEBHOOK, now: NOON });
    expect(r).toMatchObject({ pushed: 0, failed: 1 });
    const [after] = await db.select().from(schema.actions).where(and(eq(schema.actions.id, act.id), eq(schema.actions.status, 'pending')));
    expect(after.providerId).toBeNull();
  });
});

import { completeAction } from '@/lib/cadence';

describe('coexistência assistido x automático', () => {
  it('campanha assistida NÃO é entregue ao Go', async () => {
    const { db, org } = await seedPending(false, 'connected', 'conta-go-1', 'assistido');
    const r = await pushDueActionsToGo(db, { orgId: org.id, client: stub(), webhookUrl: WEBHOOK, now: NOON });
    expect(r.pushed).toBe(0);
  });

  it('a Fila (completeAction) recusa concluir ação de campanha automática', async () => {
    const { db, org, user, act } = await seedPending(false, 'connected', 'conta-go-1', 'automatico');
    await expect(completeAction(db, org.id, user.id, act.id, 'done')).rejects.toThrow(/autom/i);
  });
});

describe('ritmo seguro no push', () => {
  const OFF_HOURS = new Date('2026-11-18T06:00:00Z'); // 03:00 America/Sao_Paulo

  it('não dispara fora do horário comercial', async () => {
    const { db, org } = await seedPending();
    const r = await pushDueActionsToGo(db, { orgId: org.id, client: stub(), webhookUrl: WEBHOOK, now: OFF_HOURS });
    expect(r.pushed).toBe(0);
  });

  it('no máximo 1 ação por conta por ciclo', async () => {
    const { db, org, user, camp } = await seedPending();
    // segundo lead/enrollment/ação pendente na mesma conta/campanha
    const [lead2] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/bob', fullName: 'Bob', stage: 'new' }).returning();
    const [enr2] = await db.insert(schema.enrollments).values({ orgId: org.id, campaignId: camp.id, leadId: lead2.id, stepIndex: 0, state: 'running', nextRunAt: new Date() }).returning();
    await db.insert(schema.actions).values({ orgId: org.id, enrollmentId: enr2.id, campaignId: camp.id, leadId: lead2.id, userId: user.id, stepIndex: 0, type: 'invite', body: 'Oi Bob', dueDate: '2026-11-18', status: 'pending' });
    const client = stub();
    const r = await pushDueActionsToGo(db, { orgId: org.id, client, webhookUrl: WEBHOOK, now: NOON });
    expect(r.pushed).toBe(1);
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    expect(client.calls).toBe(1);
  });

  it('respeita o teto semanal de convites por conta', async () => {
    const { db, org } = await seedPending();
    // força o teto para 0 nesta operação
    await db.insert(schema.orgSettings).values({ orgId: org.id, weeklyInviteCap: 0 }).onConflictDoUpdate({ target: schema.orgSettings.orgId, set: { weeklyInviteCap: 0 } });
    const r = await pushDueActionsToGo(db, { orgId: org.id, client: stub(), webhookUrl: WEBHOOK, now: NOON });
    expect(r.pushed).toBe(0);
  });
});
