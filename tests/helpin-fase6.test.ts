import { describe, it, expect, beforeAll, vi } from 'vitest';

const state: { db: unknown } = { db: null };
vi.mock('@/db', async (original) => ({ ...(await original<typeof import('@/db')>()), getDb: async () => state.db }));

import { testDb, seedOrg } from './helpers';
import {
  formatMinute, isValidTimeZone, nextBusinessInstant, normalizeWeekdays, parseMinute,
  withinSchedule, getSchedule, upsertSchedule,
} from '@/lib/support-schedule';
import { clampMinutes, deadlineFrom, isSlaBreached, minutesRemaining, getSlaPolicy, updateSlaPolicy } from '@/lib/support-sla';
import { isValidWebhookUrl, normalizeEvents, signPayload, verifySignature, WEBHOOK_EVENTS } from '@/lib/webhooks';
import { createAttributeDef, listAttributeDefs, updateAttributeDef, deleteAttributeDef } from '@/lib/lead-attributes';
import { recordAudit, listAudit } from '@/lib/audit';
import { createWebhook, listWebhooks, updateWebhook, deleteWebhook } from '@/lib/webhooks';

// 2026-10-28 é quarta-feira; 2026-10-31 é sábado.
const WED_10H_LOCAL = new Date('2026-10-28T13:00:00Z'); // 10:00 em São Paulo (UTC-3)
const WED_20H_LOCAL = new Date('2026-10-28T23:00:00Z'); // 20:00 em São Paulo
const SAT_10H_LOCAL = new Date('2026-10-31T13:00:00Z');

const scheduleFixture = {
  timezone: 'America/Sao_Paulo',
  weekdays: [1, 2, 3, 4, 5],
  openMinute: 9 * 60,
  closeMinute: 18 * 60,
};

describe('horário de atendimento', () => {
  it('valida o fuso horário', () => {
    expect(isValidTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimeZone('Foo/Bar')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('converte "HH:MM" em minutos', () => {
    expect(parseMinute('09:00')).toBe(540);
    expect(parseMinute('18:30')).toBe(1110);
    expect(parseMinute('24:00')).toBeNull();
    expect(parseMinute('abc')).toBeNull();
    expect(formatMinute(540)).toBe('09:00');
  });

  it('normaliza os dias da semana', () => {
    expect(normalizeWeekdays([1, 1, 5, 9, -2, 0])).toEqual([0, 1, 5]);
    expect(normalizeWeekdays('x')).toEqual([]);
  });

  it('diz se o instante está dentro do horário', () => {
    expect(withinSchedule(scheduleFixture, WED_10H_LOCAL)).toBe(true);
    expect(withinSchedule(scheduleFixture, WED_20H_LOCAL)).toBe(false);
    expect(withinSchedule(scheduleFixture, SAT_10H_LOCAL)).toBe(false);
    expect(withinSchedule(null, SAT_10H_LOCAL)).toBe(true);
  });

  it('acha o próximo instante útil', () => {
    // Sábado 10h -> segunda 09h
    const next = nextBusinessInstant(scheduleFixture, SAT_10H_LOCAL);
    expect(withinSchedule(scheduleFixture, next)).toBe(true);
    expect(next.getTime()).toBeGreaterThan(SAT_10H_LOCAL.getTime());
  });
});

describe('SLA', () => {
  it('limita os prazos', () => {
    expect(clampMinutes(1, 60)).toBe(5);
    expect(clampMinutes(999999, 60)).toBe(43200);
    expect(clampMinutes(120, 60)).toBe(120);
  });

  it('soma minutos quando o relógio vale a pena', () => {
    const policy = { firstResponseMinutes: 60, businessHoursOnly: false };
    const due = deadlineFrom(policy, WED_10H_LOCAL);
    expect(due.getTime() - WED_10H_LOCAL.getTime()).toBe(60 * 60_000);
  });

  it('conta só o horário comercial quando pedido', () => {
    const policy = { firstResponseMinutes: 60, businessHoursOnly: true };
    // Sexta 17:00 de SP: sobram 60 minutos de expediente, o prazo vence às 18:00.
    const friday = new Date('2026-10-30T20:00:00Z');
    const due = deadlineFrom(policy, friday, scheduleFixture);
    expect(due.toISOString()).toBe('2026-10-30T21:00:00.000Z'); // 18:00 de sexta em SP
  });

  it('não conta o fim de semana no prazo', () => {
    const policy = { firstResponseMinutes: 60, businessHoursOnly: true };
    // Sexta 17:30 de SP: 30 min de sexta + 30 min de segunda às 09:30.
    const friday = new Date('2026-10-30T20:30:00Z');
    const due = deadlineFrom(policy, friday, scheduleFixture);
    expect(due.toISOString()).toBe('2026-11-02T12:30:00.000Z'); // 09:30 de segunda em SP
    expect(due.getDay()).toBe(1); // segunda-feira
  });

  it('detecta estouro de prazo', () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    expect(isSlaBreached(past)).toBe(true);
    expect(isSlaBreached(future)).toBe(false);
    expect(isSlaBreached(null)).toBe(false);
    expect(minutesRemaining(future)).toBeGreaterThan(0);
  });
});

describe('webhooks', () => {
  it('aceita apenas URLs seguras', () => {
    expect(isValidWebhookUrl('https://parceiro.com.br/hook')).toBe(true);
    expect(isValidWebhookUrl('http://localhost:3000/hook')).toBe(true);
    expect(isValidWebhookUrl('http://parceiro.com.br/hook')).toBe(false);
    expect(isValidWebhookUrl('javascript:alert(1)')).toBe(false);
    expect(isValidWebhookUrl('nao-e-url')).toBe(false);
  });

  it('filtra eventos desconhecidos', () => {
    expect(normalizeEvents(['conversation.created', 'inexistente'])).toEqual(['conversation.created']);
    expect(normalizeEvents('x')).toEqual([]);
    expect(WEBHOOK_EVENTS.length).toBeGreaterThan(0);
  });

  it('assina e confere o payload', () => {
    const secret = 'segredo';
    const body = '{"evento":1}';
    const header = signPayload(secret, body, Math.floor(Date.now() / 1000));
    expect(verifySignature(secret, body, header)).toBe(true);
    expect(verifySignature('outro', body, header)).toBe(false);
    expect(verifySignature(secret, '{"evento":2}', header)).toBe(false);
    expect(verifySignature(secret, body, null)).toBe(false);
  });

  it('recusa assinatura antiga', () => {
    const secret = 'segredo';
    const body = '{}';
    const old = signPayload(secret, body, Math.floor(Date.now() / 1000) - 3600);
    expect(verifySignature(secret, body, old)).toBe(false);
  });
});

describe('persistência (banco de teste)', () => {
  let orgId: string;

  beforeAll(async () => {
    state.db = await testDb();
    const { org } = await seedOrg(state.db as never, 'Fase Seis');
    orgId = org.id;
  });

  it('cria, lista, altera e remove campos personalizados', async () => {
    const def = await createAttributeDef(orgId, { name: 'Segmento', type: 'select', options: ['A', 'B'] });
    expect(def.key).toBe('segmento');
    const list = await listAttributeDefs(orgId);
    expect(list.map((d) => d.name)).toContain('Segmento');

    const updated = await updateAttributeDef(orgId, def.id, { name: 'Segmento do cliente' });
    expect(updated.name).toBe('Segmento do cliente');

    await deleteAttributeDef(orgId, def.id);
    expect((await listAttributeDefs(orgId)).length).toBe(0);
  });

  it('não deixa repetir a chave do mesmo campo', async () => {
    await createAttributeDef(orgId, { name: 'Origem' });
    await expect(createAttributeDef(orgId, { name: 'origem' })).rejects.toThrow(/Já existe/i);
  });

  it('salva o horário da operação', async () => {
    const created = await getSchedule(orgId);
    expect(created.timezone).toBe('America/Sao_Paulo');
    const updated = await upsertSchedule(orgId, { openMinute: 8 * 60, closeMinute: 17 * 60, autoReplyEnabled: true, autoReplyMessage: 'Voltamos amanhã.' });
    expect(updated.openMinute).toBe(480);
    expect(updated.autoReplyEnabled).toBe(true);
    await expect(upsertSchedule(orgId, { openMinute: 600, closeMinute: 540 })).rejects.toThrow(/antes do fechamento/i);
  });

  it('salva a política de SLA', async () => {
    const created = await getSlaPolicy(orgId);
    expect(created.firstResponseMinutes).toBe(60);
    const updated = await updateSlaPolicy(orgId, { firstResponseMinutes: 15, businessHoursOnly: false });
    expect(updated.firstResponseMinutes).toBe(15);
    expect(updated.businessHoursOnly).toBe(false);
  });

  it('registra e lista a auditoria', async () => {
    await recordAudit(orgId, { action: 'teste.acao', entity: 'support_conversation', entityId: 'abc', payload: { x: 1 } });
    const rows = await listAudit(orgId, { limit: 10 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].action).toBe('teste.acao');
  });

  it('gerencia os webhooks da operação', async () => {
    const hook = await createWebhook(orgId, { url: 'https://parceiro.com.br/hook', events: ['conversation.created'] });
    expect(hook.secret.length).toBeGreaterThan(20);
    expect((await listWebhooks(state.db as never, orgId)).length).toBe(1);

    const updated = await updateWebhook(orgId, hook.id, { active: false });
    expect(updated?.active).toBe(false);

    expect(await deleteWebhook(orgId, hook.id)).toBe(true);
    expect((await listWebhooks(state.db as never, orgId)).length).toBe(0);
  });

  it('recusa URL insegura e evento inválido', async () => {
    await expect(createWebhook(orgId, { url: 'http://parceiro.com.br/hook', events: ['conversation.created'] })).rejects.toThrow(/inválida/i);
    await expect(createWebhook(orgId, { url: 'https://parceiro.com.br/hook', events: [] })).rejects.toThrow(/evento/i);
  });
});
