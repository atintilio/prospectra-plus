import { test, expect, vi } from 'vitest';
import { createAgendaAdmin, agendaStatus } from '@/lib/agenda';

test('a agenda fora do ar é reportada sem derrubar a tela', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
  vi.stubGlobal('fetch', fetcher);
  const status = await agendaStatus();
  expect(status.unreachable).toBe(true);
  expect(status.awaitingAdmin).toBe(false);
  vi.unstubAllGlobals();
});

test('a criação do administrador exige o endpoint e devolve o erro da agenda', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('No setup needed.', { status: 400 }));
  vi.stubGlobal('fetch', fetcher);
  const result = await createAgendaAdmin({ username: 'atintilio', fullName: 'Atintilio', email: 'a@b.com', password: 'SenhaLonga123' });
  expect(result.ok).toBe(false);
  expect(fetcher.mock.calls[0][0]).toMatch(/\/api\/auth\/setup$/);
  const options = fetcher.mock.calls[0][1] as RequestInit;
  expect(JSON.parse(String(options.body)).username).toBe('atintilio');
  vi.unstubAllGlobals();
});
