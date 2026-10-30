import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

const f = vi.hoisted(() => ({ auth: vi.fn(), db: undefined as unknown }));

// A sessão e o banco são injetados: o teste roda a rota de verdade contra um
// Postgres em memória (PGlite), sem rede e sem sessão real.
vi.mock('@/lib/auth', () => ({ requireOrg: f.auth }));
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return { ...actual, getDb: async () => f.db };
});

import { DELETE, GET, POST } from '@/app/api/agenda/blackouts/route';
import { formatInTimeZone } from '@/app/agendamento/[slug]/booking-view';
import { createEventType, listPublicSlots } from '@/lib/agenda-booking';
import { schema } from '@/db';
import { testDb, seedOrg } from './helpers';

type Json = { ok?: boolean; error?: string; blackout?: BlackoutJson; blackouts?: BlackoutJson[] };
type BlackoutJson = { id: string; startAt: string; endAt: string; reason: string };

const HOUR = 60 * 60 * 1000;

/** Instante no futuro, em ISO (usado nos corpos da API). */
function futureIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** Corpo JSON para a API. */
function jsonRequest(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Duas operações diferentes (o bloqueio de uma não pode aparecer na outra). */
async function setup() {
  const db = await testDb();
  const a = await seedOrg(db, 'Operacao A');
  const b = await seedOrg(db, 'Operacao B');
  f.db = db;
  f.auth.mockResolvedValue({ user: { id: a.user.id }, org: { id: a.org.id } });
  return { db, a, b };
}

/** Entra na operação B. */
function loginAs(orgId: string, userId: string): void {
  f.auth.mockResolvedValue({ user: { id: userId }, org: { id: orgId } });
}

/** Lê o corpo JSON da resposta. */
async function body(res: Response): Promise<Json> {
  return (await res.json()) as Json;
}

describe('agenda nativa — bloqueios (API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria o bloqueio e devolve os dados salvos', async () => {
    const { db } = await setup();
    const startAt = futureIso(24 * HOUR);
    const endAt = futureIso(26 * HOUR);

    const res = await POST(jsonRequest('http://localhost/api/agenda/blackouts', { startAt, endAt, reason: 'Reunião interna' }));

    expect(res.status).toBe(201);
    const payload = await body(res);
    expect(payload.ok).toBe(true);
    expect(payload.blackout).toBeTruthy();
    expect(payload.blackout?.startAt).toBe(new Date(startAt).toISOString());
    expect(payload.blackout?.endAt).toBe(new Date(endAt).toISOString());
    expect(payload.blackout?.reason).toBe('Reunião interna');

    const stored = await db.select().from(schema.agendaBlackouts).where(eq(schema.agendaBlackouts.id, payload.blackout?.id ?? ''));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.reason).toBe('Reunião interna');
  });

  it('lista os bloqueios da operação', async () => {
    await setup();
    await POST(jsonRequest('http://localhost/api/agenda/blackouts', { startAt: futureIso(24 * HOUR), endAt: futureIso(25 * HOUR) }));
    await POST(jsonRequest('http://localhost/api/agenda/blackouts', { startAt: futureIso(48 * HOUR), endAt: futureIso(49 * HOUR) }));

    const res = await GET();
    expect(res.status).toBe(200);
    const payload = await body(res);
    expect(payload.ok).toBe(true);
    expect(payload.blackouts).toHaveLength(2);
  });

  it('remove o bloqueio e libera o período', async () => {
    const { db } = await setup();
    const created = await POST(jsonRequest('http://localhost/api/agenda/blackouts', { startAt: futureIso(24 * HOUR), endAt: futureIso(25 * HOUR) }));
    const id = (await body(created)).blackout?.id ?? '';

    const res = await DELETE(jsonRequest('http://localhost/api/agenda/blackouts', { id }, 'DELETE'));
    expect(res.status).toBe(200);
    expect((await body(res)).ok).toBe(true);

    const rest = await body(await GET());
    expect(rest.blackouts).toHaveLength(0);
    const stored = await db.select().from(schema.agendaBlackouts).where(eq(schema.agendaBlackouts.id, id));
    expect(stored).toHaveLength(0);
  });

  it('remove pelo id na query string', async () => {
    await setup();
    const created = await POST(jsonRequest('http://localhost/api/agenda/blackouts', { startAt: futureIso(24 * HOUR), endAt: futureIso(25 * HOUR) }));
    const id = (await body(created)).blackout?.id ?? '';

    const res = await DELETE(new Request(`http://localhost/api/agenda/blackouts?id=${id}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect((await body(await GET())).blackouts).toHaveLength(0);
  });

  it('recusa bloqueio que termina antes de começar', async () => {
    await setup();
    const startAt = futureIso(24 * HOUR);
    const endAt = futureIso(23 * HOUR);

    const res = await POST(jsonRequest('http://localhost/api/agenda/blackouts', { startAt, endAt }));
    expect(res.status).toBe(400);
    const payload = await body(res);
    expect(payload.ok).toBe(false);
    expect(payload.error).toMatch(/depois do início/i);
    expect((await body(await GET())).blackouts).toHaveLength(0);
  });

  it('recusa bloqueio no passado', async () => {
    await setup();
    const res = await POST(
      jsonRequest('http://localhost/api/agenda/blackouts', {
        startAt: new Date(Date.now() - 48 * HOUR).toISOString(),
        endAt: new Date(Date.now() - 24 * HOUR).toISOString(),
      }),
    );
    expect(res.status).toBe(400);
    expect((await body(res)).error).toMatch(/passado/i);
    expect((await body(await GET())).blackouts).toHaveLength(0);
  });

  it('recusa bloqueio com mais de 1 ano à frente', async () => {
    await setup();
    const res = await POST(
      jsonRequest('http://localhost/api/agenda/blackouts', {
        startAt: futureIso(400 * 24 * HOUR),
        endAt: futureIso(402 * 24 * HOUR),
      }),
    );
    expect(res.status).toBe(400);
    expect((await body(res)).error).toMatch(/1 ano/i);
  });

  it('não vaza o bloqueio de outra operação', async () => {
    const { a, b } = await setup();
    const created = await POST(jsonRequest('http://localhost/api/agenda/blackouts', { startAt: futureIso(24 * HOUR), endAt: futureIso(25 * HOUR) }));
    const id = (await body(created)).blackout?.id ?? '';

    // A operação B não enxerga o bloqueio da operação A.
    loginAs(b.org.id, b.user.id);
    const listB = await body(await GET());
    expect(listB.blackouts).toHaveLength(0);

    // E não consegue remover o bloqueio de outro.
    const del = await DELETE(jsonRequest('http://localhost/api/agenda/blackouts', { id }, 'DELETE'));
    expect(del.status).toBe(404);

    // O bloqueio da operação A continua no lugar.
    loginAs(a.org.id, a.user.id);
    const listA = await body(await GET());
    expect(listA.blackouts).toHaveLength(1);
    expect(listA.blackouts?.[0]?.id).toBe(id);
  });

  it('exige sessão da operação', async () => {
    await setup();
    const erro = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' });
    f.auth.mockRejectedValue(erro);

    const res = await GET();
    expect(res.status).toBe(401);
    expect((await body(res)).ok).toBe(false);
  });
});

describe('agenda nativa — bloqueios (efeito na agenda)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('o horário bloqueio some da agenda pública', async () => {
    const { db, a } = await setup();
    const scope = { orgId: a.org.id, userId: a.user.id };
    const eventType = await createEventType(db, scope, {
      title: 'Reunião de Vendas',
      durationMin: 60,
      slotIntervalMin: 60,
      minNoticeMin: 0,
      timezone: 'America/Sao_Paulo',
      availability: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startMinute: 9 * 60, endMinute: 18 * 60 })),
    });

    const inicio = Date.now() + 24 * HOUR;
    const fim = Date.now() + 72 * HOUR;
    await POST(jsonRequest('http://localhost/api/agenda/blackouts', { startAt: new Date(inicio).toISOString(), endAt: new Date(fim).toISOString() }));

    const slots = await listPublicSlots(db, eventType.slug);
    expect(slots.ok).toBe(true);
    if (!slots.ok) return;
    const dentro = slots.slots.filter((slot) => {
      const inicioSlot = new Date(slot.startIso).getTime();
      return inicioSlot >= inicio && inicioSlot < fim;
    });
    expect(dentro).toHaveLength(0);
    expect(slots.slots.length).toBeGreaterThan(0);
  });
});

describe('agenda nativa — fuso de quem agenda', () => {
  it('formata o mesmo instante em dois fusos diferentes', () => {
    const iso = '2026-11-12T17:00:00.000Z';
    const sp = formatInTimeZone(iso, 'America/Sao_Paulo');
    const toquio = formatInTimeZone(iso, 'Asia/Tokyo');

    expect(sp.time).toBe('14:00');
    expect(sp.date).toBe('12/11');
    expect(toquio.time).toBe('02:00');
    expect(toquio.date).toBe('13/11');
  });

  it('devolve string vazia para fuso inválido', () => {
    expect(formatInTimeZone('2026-11-12T17:00:00.000Z', 'Fuso/Inventado')).toEqual({ time: '', date: '' });
  });
});
