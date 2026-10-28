import { expect, test, vi } from 'vitest';
import { ensureHarveyWebhook } from '@/lib/whatsapp/harvey-webhook';
import type { Scope } from '@/lib/whatsapp/akg';

const scope = { orgId: 'org-1', userId: 'seller-1' };
const config = { master: 'a-master-secret-with-at-least-32-characters', origin: 'https://prospectra.example.com' };
const connected = { state: 'connected' as const, checkedAt: '2026-10-28T00:00:00.000Z' };

test('status de sessão conectada reconcilia o webhook do Harvey', async () => {
  const configureWebhook = vi.fn(async (_scope: Scope, _callback: string, _secret: string) => {});
  const result = await ensureHarveyWebhook({ configureWebhook }, scope, connected, 'status', config);
  expect(result).toEqual(connected);
  expect(configureWebhook).toHaveBeenCalledOnce();
  expect(configureWebhook.mock.calls[0][1]).toBe('https://prospectra.example.com/api/harvey/inbound');
  expect(configureWebhook.mock.calls[0][2]).toHaveLength(64);
});

test('conexão inicial prepara o webhook antes do pareamento terminar', async () => {
  const configureWebhook = vi.fn(async (_scope: Scope, _callback: string, _secret: string) => {});
  const qr = { state: 'qr_ready' as const, checkedAt: connected.checkedAt };
  expect(await ensureHarveyWebhook({ configureWebhook }, scope, qr, 'connect', config)).toEqual(qr);
  expect(configureWebhook).toHaveBeenCalledOnce();
  await ensureHarveyWebhook({ configureWebhook }, scope, { state: 'disconnected', checkedAt: connected.checkedAt }, 'status', config);
  expect(configureWebhook).toHaveBeenCalledOnce();
});

test('falha de configuração preserva estado conectado e avisa que Harvey não recebe', async () => {
  const configureWebhook = vi.fn(async (_scope: Scope, _callback: string, _secret: string) => { throw new Error('gateway unavailable'); });
  const result = await ensureHarveyWebhook({ configureWebhook }, scope, connected, 'status', config);
  expect(result.state).toBe('connected');
  expect(result.message).toContain('não foi confirmado');
  expect((await ensureHarveyWebhook({ configureWebhook }, scope, connected, 'status', { master: config.master })).message).toContain('não foi confirmado');
});
