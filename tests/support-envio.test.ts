/**
 * Helpin: a resposta do inbox nunca pode dizer "Resposta enviada" quando o envio falha.
 *
 * Regras cobertas aqui:
 * - falha do gateway (WhatsApp) => a ação devolve ERRO e o recibo fica 'unknown' (nunca 'sent');
 * - envio confirmado => continua devolvendo "Resposta enviada." e o recibo fica 'sent';
 * - conversa de web => não usa o gateway (a gravação no atendimento é a entrega);
 * - gateway não configurado => erro na tela, sem recibo 'sent';
 * - operação de demonstração => nada é enviado de verdade;
 * - resposta do Argus por e-mail => e-mail recusado também não pode virar "Resposta enviada".
 */
import { afterEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import { schema } from '@/db';
import type { DB } from '@/db';
import type { Ctx } from '@/lib/auth';

const state = vi.hoisted(() => ({
  db: null as unknown as DB,
  ctx: null as unknown as Ctx,
  send: null as null | (() => Promise<{ providerMessageId: string }>),
  config: { baseUrl: 'https://wa.example', apiKey: 'test-only' } as null | { baseUrl: string; apiKey: string },
  mail: null as null | (() => Promise<void>),
}));

vi.mock('@/db', async (original) => ({ ...(await original<typeof import('@/db')>()), getDb: async () => state.db }));
vi.mock('@/lib/auth', () => ({
  requireOrg: async () => state.ctx,
  requireAdmin: async () => state.ctx,
  requireUser: async () => state.ctx,
  canManage: () => true,
  normalizeEmail: (email: string) => email,
  issueAccessLink: async () => 'link',
  switchOrg: async () => {},
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); } }));
vi.mock('@/lib/whatsapp/akg', () => ({
  akgConfig: () => state.config,
  AkgGateway: class {
    async sendText(_scope: unknown, _recipient: string, _text: string) {
      if (!state.send) throw new Error('gateway sem send configurado');
      return state.send();
    }
  },
}));
vi.mock('@/lib/mailer', () => ({
  sendSupportMail: async () => { if (state.mail) await state.mail(); },
  sendAccessEmail: async () => {},
  sendCalendarInvite: async () => {},
  sendCommercialNotification: async () => {},
}));

import { replySupportAction, argusReplyAction } from '@/app/(app)/actions';
import { addWidgetOrigin, intakeWebMessage, intakeWhatsappMessage, openInternalTicket } from '@/lib/support';

afterEach(() => {
  state.send = null;
  state.mail = null;
  state.config = { baseUrl: 'https://wa.example', apiKey: 'test-only' };
});

async function setup(channel: 'whatsapp' | 'web') {
  const db = state.db = await testDb();
  const { org, user } = await seedOrg(db, 'Helpin Envio');
  state.ctx = { user, org, role: 'owner', sessionId: 'test' } as unknown as Ctx;
  const conversationId = channel === 'whatsapp'
    ? (await intakeWhatsappMessage(db, { orgId: org.id, phone: '5511988887777', name: 'Cliente', body: 'oi, preciso de ajuda', providerId: 'wamid.1' })).conversationId
    : (await (async () => { await addWidgetOrigin(db, org.id, 'https://site.com'); return (await intakeWebMessage(db, { orgId: org.id, origin: 'https://site.com', body: 'oi' })).conversationId; })());
  return { db, org, user, conversationId };
}

test('falha no envio do WhatsApp não devolve sucesso e o recibo fica unknown', async () => {
  const { db, conversationId } = await setup('whatsapp');
  state.send = async () => { throw Error('WA-AKG indisponível ou sem resposta.'); };

  const result = await replySupportAction(conversationId, 'Vamos resolver isso agora.');

  expect(result?.ok).toBeUndefined();
  expect(result?.error).toContain('WA-AKG indisponível');
  expect(result?.error).toContain('não confirmou o envio');

  const receipts = await db.select().from(schema.whatsappCommands);
  expect(receipts).toHaveLength(1);
  expect(receipts[0].state).toBe('unknown');
  expect(receipts[0].state).not.toBe('sent');
  expect(receipts[0].providerMessageId).toBeNull();
});

test('envio confirmado continua devolvendo "Resposta enviada" e o recibo fica sent', async () => {
  const { db, conversationId } = await setup('whatsapp');
  state.send = async () => ({ providerMessageId: 'wamid.out.1' });

  const result = await replySupportAction(conversationId, 'Vamos resolver isso agora.');

  expect(result?.error).toBeUndefined();
  expect(result?.ok).toBe('Resposta enviada.');

  const receipts = await db.select().from(schema.whatsappCommands);
  expect(receipts).toHaveLength(1);
  expect(receipts[0].state).toBe('sent');
  expect(receipts[0].providerMessageId).toBe('wamid.out.1');
});

test('conversa de web não passa pelo gateway e devolve "Resposta enviada"', async () => {
  const { db, conversationId } = await setup('web');
  let called = false;
  state.send = async () => { called = true; return { providerMessageId: 'wamid.out.2' }; };

  const result = await replySupportAction(conversationId, 'Podemos resolver assim.');

  expect(called).toBe(false);
  expect(result?.ok).toBe('Resposta enviada.');
  expect(await db.select().from(schema.whatsappCommands)).toHaveLength(0);
});

test('sem gateway configurado o WhatsApp falha na tela em vez de dizer que enviou', async () => {
  const { db, conversationId } = await setup('whatsapp');
  state.config = null;

  const result = await replySupportAction(conversationId, 'Vamos resolver isso agora.');

  expect(result?.ok).toBeUndefined();
  expect(result?.error).toContain('não está configurado');

  const receipts = await db.select().from(schema.whatsappCommands);
  expect(receipts).toHaveLength(1);
  expect(receipts[0].state).toBe('unknown');
});

test('operação de demonstração não envia mensagem de verdade', async () => {
  const { db, org, conversationId } = await setup('whatsapp');
  await db.update(schema.orgs).set({ isDemo: true }).where(eq(schema.orgs.id, org.id));
  state.ctx = { ...(state.ctx as unknown as Ctx), org: { ...org, isDemo: true } } as unknown as Ctx;
  let called = false;
  state.send = async () => { called = true; return { providerMessageId: 'wamid.out.3' }; };

  const result = await replySupportAction(conversationId, 'Resposta de demonstração.');

  expect(called).toBe(false);
  expect(result?.ok).toContain('Demonstração');
  expect(await db.select().from(schema.whatsappCommands)).toHaveLength(0);
});

test('resposta do Argus com e-mail recusado não vira "Resposta enviada"', async () => {
  const db = state.db = await testDb();
  const { org, user } = await seedOrg(db, 'Helpin Argus');
  state.ctx = { user, org, role: 'owner', sessionId: 'test' } as unknown as Ctx;
  const { conversationId } = await openInternalTicket(db, { orgId: org.id, userId: user.id, email: user.email, name: user.name }, { subject: 'Erro ao entrar', body: 'não consigo logar' });
  state.mail = async () => { throw Error('OFFICE365_NOT_CONFIGURED'); };

  const result = await argusReplyAction(conversationId, 'já resolvemos, tente de novo');

  expect(result?.ok).toBeUndefined();
  expect(result?.error).toContain('não foi enviado');
  expect(result?.error).toContain('Office 365');

  state.mail = async () => {};
  const ok = await argusReplyAction(conversationId, 'agora sim, resolvido');
  expect(ok?.ok).toBe('Resposta enviada.');
  expect(ok?.error).toBeUndefined();
});
