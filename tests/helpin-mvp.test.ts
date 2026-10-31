// Suite do Helpin 100% em modo demo: nenhuma conversa sai por WhatsApp, e-mail ou rede externa.
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { seedOrg, testDb } from './helpers';
import { ensureDemo } from '@/lib/demo';
import { assignConversationAction, closeConversationAction, createConversationAction, replyAction } from '@/app/(app)/helpin/actions';

vi.mock('@/db', async () => ({ ...await vi.importActual('@/db'), getDb: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireOrg: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// Se qualquer código de produção tentar enviar e-mail de verdade, aqui estoura — e os testes provam que nunca é chamado.
vi.mock('@/lib/mailer', () => ({ sendRawEmail: vi.fn(async () => { throw new Error('EMAIL_PROIBIDO_EM_TESTE'); }) }));
// Export real de src/lib/whatsapp/commands.ts: sendWhatsAppCommand. Também proibido nesta suite.
vi.mock('@/lib/whatsapp/commands', () => ({ sendWhatsAppCommand: vi.fn(async () => { throw new Error('WHATSAPP_PROIBIDO_EM_TESTE'); }) }));

// SPIA GLOBAL: em toda a suite do Helpin nada externo pode ser tocado (a suite inteira é demo).
const spyFetch = vi.fn(async () => { throw new Error('REDE_PROIBIDA'); });
beforeEach(() => { vi.stubGlobal('fetch', spyFetch); });
afterEach(() => { vi.useRealTimers(); });

type Ctx = { user: typeof schema.users.$inferSelect; org: typeof schema.orgs.$inferSelect; role: string; sessionId: string };
let db!: Awaited<ReturnType<typeof testDb>>;
let ctx!: Ctx;
let donoOrg!: typeof schema.orgs.$inferSelect;

const form = (entrada: Record<string, string>): FormData => { const f = new FormData(); Object.entries(entrada).forEach(([k, v]) => f.set(k, v)); return f; };
const convOf = async (id: string) => { const [c] = await db.select().from(schema.helpinConversations).where(eq(schema.helpinConversations.id, id)); return c; };
const msgsOf = async (conversationId: string) => await db.select().from(schema.helpinMessages).where(eq(schema.helpinMessages.conversationId, conversationId));
const openWhatsApp = async () => {
  const [conv] = await db.select().from(schema.helpinConversations)
    .where(and(eq(schema.helpinConversations.orgId, ctx.org.id), eq(schema.helpinConversations.channel, 'whatsapp'), eq(schema.helpinConversations.status, 'open'))).limit(1);
  return conv;
};

beforeEach(async () => {
  db = await testDb();
  const dono = await seedOrg(db, 'Dono');
  donoOrg = dono.org;
  // Caixa demo pré-carregada do próprio usuário: org demo com 5 conversas (3 whatsapp, 2 helpin, uma closed).
  const demoId = await ensureDemo(db, dono.user);
  const [demoOrg] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, demoId));
  ctx = { user: dono.user, org: demoOrg, role: 'owner', sessionId: 't' };
  vi.mocked(getDb).mockResolvedValue(db);
  vi.mocked(requireOrg).mockResolvedValue(ctx as never);
});

test('cria conversa a partir da primeira mensagem do contato', async () => {
  const r = await createConversationAction(undefined, form({ contactName: 'Rafaela Pilar', subject: 'Quero entender o diagnóstico', firstMessage: 'Vocês atendem em Joinville?' }));
  expect(r?.ok).toBeTruthy();
  const [conv] = await db.select().from(schema.helpinConversations)
    .where(and(eq(schema.helpinConversations.orgId, ctx.org.id), eq(schema.helpinConversations.contactName, 'Rafaela Pilar')));
  expect(conv.channel).toBe('helpin');
  expect(conv.status).toBe('open');
  expect(conv.subject).toBe('Quero entender o diagnóstico');
  const msgs = await msgsOf(conv.id);
  expect(msgs).toHaveLength(1);
  expect(msgs[0].sender).toBe('contact');
  expect(msgs[0].body).toBe('Vocês atendem em Joinville?');
  expect(msgs[0].simulated).toBe(false);
});

test('resposta do agente na demo é SIMULADA e nunca enviada por WhatsApp/e-mail', async () => {
  const conv = await openWhatsApp();
  const saida = await msgsOf(conv.id).then((m) => m.filter((x) => x.sender === 'agent')).then((m) => m.length);
  const r = await replyAction(undefined, form({ conversationId: conv.id, body: 'Envio o contrato hoje mesmo.' }));
  expect(r?.ok).toContain('simulada');
  const inseridas = (await msgsOf(conv.id)).filter((m) => m.sender === 'agent' && m.body === 'Envio o contrato hoje mesmo.');
  expect(inseridas).toHaveLength(1);
  expect(inseridas[0].simulated).toBe(true);
  expect((await msgsOf(conv.id)).filter((m) => m.sender === 'agent')).toHaveLength(saida + 1);
  // Nada foi disparado para e-mail nem WhatsApp (módulos reais existentes, mockados por segurança).
  const { sendRawEmail } = await import('@/lib/mailer');
  const { sendWhatsAppCommand } = await import('@/lib/whatsapp/commands');
  expect(vi.mocked(sendRawEmail)).not.toHaveBeenCalled();
  expect(vi.mocked(sendWhatsAppCommand)).not.toHaveBeenCalled();
});

test('conversa encerrada não aceita resposta', async () => {
  const conv = await openWhatsApp();
  await closeConversationAction(conv.id, 'closed');
  expect((await convOf(conv.id)).status).toBe('closed');
  const r = await replyAction(undefined, form({ conversationId: conv.id, body: 'Ainda dá tempo?' }));
  expect((r?.error ?? '')).toContain('encerrada');
});

test('atribuição e reabertura simples', async () => {
  const conv = await openWhatsApp();
  await assignConversationAction(conv.id, ctx.user.id);
  expect((await convOf(conv.id)).assigneeId).toBe(ctx.user.id);
  await closeConversationAction(conv.id, 'closed');
  expect((await convOf(conv.id)).status).toBe('closed');
  await closeConversationAction(conv.id, 'open'); // reabrir
  expect((await convOf(conv.id)).status).toBe('open');
});

test('isolamento: conversa de outra organização não é vista nem respondida', async () => {
  const [forasteiro] = await db.insert(schema.helpinConversations).values({ orgId: donoOrg.id, contactName: 'Cliente Alheia', channel: 'email', status: 'open' }).returning();
  const antes = await convOf(forasteiro.id);
  expect((await replyAction(undefined, form({ conversationId: forasteiro.id, body: 'Tentativa de fora' })))?.error).toBe('Conversa não encontrada.');
  await assignConversationAction(forasteiro.id, ctx.user.id);
  await closeConversationAction(forasteiro.id, 'closed');
  const depois = await convOf(forasteiro.id);
  expect(depois).toEqual(antes); // zero updates: status e assigneeId continuam intocados
  expect(await msgsOf(forasteiro.id)).toHaveLength(0); // nenhuma resposta foi gravada
});

test('autorresposta fora do horário de atendimento', async () => {
  await db.insert(schema.orgSettings).values({ orgId: ctx.org.id, atendimentoStart: '04:00', atendimentoEnd: '05:00', autoReply: 'Estamos fora do horário; retornamos no próximo turno.' });
  const [conv] = await db.insert(schema.helpinConversations).values({ orgId: ctx.org.id, subject: 'Socorro fora do expediente', contactName: 'Nocturno Silva', channel: 'helpin', status: 'open' }).returning();
  await db.insert(schema.helpinMessages).values({ orgId: ctx.org.id, conversationId: conv.id, sender: 'contact', body: 'Preciso de ajuda AGORA.' });
  const agora = new Date('2026-11-10T12:00:00'); // 12h locais: longe da janela 04:00–05:00
  vi.useFakeTimers({ toFake: ['Date'] }); // apenas o relógio: timers reais seguem para o PGlite funcionar
  vi.setSystemTime(agora);
  const r = await replyAction(undefined, form({ conversationId: conv.id, body: 'Já vi sua mensagem, estou aqui.' }));
  expect(r?.ok).toBeTruthy();
  const agentes = (await msgsOf(conv.id)).filter((m) => m.sender === 'agent');
  expect(agentes).toHaveLength(2);
  expect(agentes.some((m) => m.body === 'Já vi sua mensagem, estou aqui.')).toBe(true);
  const autoresposta = agentes.find((m) => m.body.includes('[Autoresposta'));
  expect(autoresposta?.simulated).toBe(true);
  expect(autoresposta?.body).toContain('retornamos no próximo turno.');
});

test('demo pré-carregada tem 5 conversas e mensagem simulada do agente', async () => {
  const [u] = await db.insert(schema.users).values({ email: 'dono-helpin-mvp@demo.invalid', name: 'Dono Demo MVP', status: 'active' }).returning();
  const demoId = await ensureDemo(db, u);
  const convs = await db.select().from(schema.helpinConversations).where(eq(schema.helpinConversations.orgId, demoId));
  expect(convs.length).toBe(5);
  expect(convs.filter((c) => c.channel === 'whatsapp')).toHaveLength(3);
  expect(convs.filter((c) => c.status === 'closed')).toHaveLength(1);
  const msgs = await db.select().from(schema.helpinMessages).where(eq(schema.helpinMessages.orgId, demoId));
  expect(msgs.length).toBeGreaterThanOrEqual(10);
  expect(msgs.some((m) => m.sender === 'agent' && m.simulated)).toBe(true);
  // fim da suite inteira: nenhuma rede externa foi tocada em qualquer teste deste arquivo
  expect(spyFetch).not.toHaveBeenCalled();
});
