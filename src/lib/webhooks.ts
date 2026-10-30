import 'server-only';
import { createHmac } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb, schema, type DB } from '@/db';
import { newToken } from './crypto';

/**
 * Webhooks de saída (Helpin fase D).
 *
 * A operação cadastra URLs que recebem eventos do atendimento. Cada envio
 * leva um cabeçalho de assinatura HMAC-SHA256 para o parceiro validar:
 *
 *   X-Prospectra-Signature: t=<timestamp>,v1=<hex>
 *   X-Prospectra-Event:    conversation.created
 */

export const WEBHOOK_EVENTS = [
  'conversation.created',
  'conversation.replied',
  'conversation.closed',
  'csat.received',
  'lead.updated',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_TIMEOUT_MS = 8000;

export type WebhookEndpoint = typeof schema.webhookEndpoints.$inferSelect;

export type WebhookInput = {
  url: string;
  events?: string[];
  active?: boolean;
};

/** Só https (e http em localhost) — evita expor o servidor para URLs claramente inseguras. */
export function isValidWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return true;
  return false;
}

export function normalizeEvents(events: unknown): WebhookEvent[] {
  if (!Array.isArray(events)) return [];
  const valid = new Set<string>(WEBHOOK_EVENTS);
  return [...new Set(events.map((e) => String(e)).filter((e) => valid.has(e)))] as WebhookEvent[];
}

/** Assinatura HMAC-SHA256 do corpo + timestamp (formato `t=...,v1=...`). */
export function signPayload(secret: string, body: string, timestamp: number): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

/** Confere a assinatura de um payload recebido (util para testes e paridade). */
export function verifySignature(secret: string, body: string, header: string | null, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=').map((s) => s.trim())));
  const timestamp = Number(parts.t);
  const provided = parts.v1;
  if (!Number.isFinite(timestamp) || !provided) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return expected === provided;
}

export async function listWebhooks(db: DB, orgId: string): Promise<WebhookEndpoint[]> {
  return db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.orgId, orgId));
}

export async function createWebhook(orgId: string, input: WebhookInput): Promise<WebhookEndpoint> {
  const db = await getDb();
  const url = String(input.url ?? '').trim();
  if (!isValidWebhookUrl(url)) throw new Error('URL de webhook inválida (use https)');
  const events = normalizeEvents(input.events);
  if (events.length === 0) throw new Error('Escolha ao menos um evento');
  const [created] = await db.insert(schema.webhookEndpoints).values({
    orgId,
    url,
    secret: newToken(),
    events,
    active: input.active ?? true,
  }).returning();
  return created;
}

export async function updateWebhook(orgId: string, id: string, patch: Partial<WebhookInput>): Promise<WebhookEndpoint | null> {
  const db = await getDb();
  const values: Record<string, unknown> = {};
  if (patch.url !== undefined) {
    const url = String(patch.url).trim();
    if (!isValidWebhookUrl(url)) throw new Error('URL de webhook inválida (use https)');
    values.url = url;
  }
  if (patch.events !== undefined) {
    const events = normalizeEvents(patch.events);
    if (events.length === 0) throw new Error('Escolha ao menos um evento');
    values.events = events;
  }
  if (patch.active !== undefined) values.active = patch.active;
  const [updated] = await db.update(schema.webhookEndpoints)
    .set(values)
    .where(and(eq(schema.webhookEndpoints.orgId, orgId), eq(schema.webhookEndpoints.id, id)))
    .returning();
  return updated ?? null;
}

export async function deleteWebhook(orgId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const deleted = await db.delete(schema.webhookEndpoints)
    .where(and(eq(schema.webhookEndpoints.orgId, orgId), eq(schema.webhookEndpoints.id, id)))
    .returning({ id: schema.webhookEndpoints.id });
  return deleted.length > 0;
}

/**
 * Dispara o evento para todos os webhooks ativos inscritos nele.
 * Falha de um parceiro não pode derrubar o atendimento — erros são logados.
 */
export async function dispatchWebhook(
  orgId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
  db?: DB,
): Promise<{ delivered: number; failed: number }> {
  const database = db ?? (await getDb());
  const targets = (await listWebhooks(database, orgId)).filter(
    (w) => w.active && (w.events as string[]).includes(event),
  );
  if (targets.length === 0) return { delivered: 0, failed: 0 };

  const body = JSON.stringify({ event, orgId, sentAt: new Date().toISOString(), data: payload });
  let delivered = 0;
  let failed = 0;
  await Promise.all(targets.map(async (w) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
      try {
        const res = await fetch(w.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'user-agent': 'Prospectra-Webhooks/1.0',
            'x-prospectra-event': event,
            'x-prospectra-signature': signPayload(w.secret, body, Math.floor(Date.now() / 1000)),
          },
          body,
          signal: controller.signal,
        });
        if (res.ok) delivered++;
        else failed++;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      failed++;
      console.error('[webhook] falha ao entregar', w.url, err);
    }
  }));
  return { delivered, failed };
}
