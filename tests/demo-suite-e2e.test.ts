import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { and, count, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { testDb } from './helpers';
import { ensureDemo } from '@/lib/demo';
import { connectAccount, disconnectAccount, testAccount } from '@/lib/linkedin';
import { enrollLeads } from '@/lib/cadence';
import { saveDemoVoice, readDemoVoice, demoVoiceProfile } from '@/lib/voice/demo';
import { queueVoiceDelivery } from '@/lib/voice/delivery';import { createMeeting, sendMeetingInvite, buildIcs } from '@/lib/agenda';
import { demoLinkedInReplyAction } from '@/app/(app)/simulador/actions';
import { replyAction } from '@/app/(app)/helpin/actions';
import { demoRegisterVoiceAction } from '@/app/(app)/whatsapp/voice-demo-actions';
import { GET as audioRoute } from '@/app/api/voice-demo/audio/route';

vi.mock('@/db', async () => ({ ...await vi.importActual('@/db'), getDb: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireOrg: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// SPIA GLOBAL: em toda a suite fim a fim da demo nenhuma rede externa pode ser tocada.
const spyFetch = vi.fn(async () => { throw new Error('REDE_PROIBIDA_NA_DEMO'); });
beforeEach(() => { vi.stubGlobal('fetch', spyFetch); vi.stubEnv('SECRETS_KEY', 'chave-oficial-do-ambiente-de-teste'); });
afterEach(() => { vi.unstubAllEnvs(); });
beforeEach(() => { vi.stubEnv('SECRETS_KEY', 'chave-oficial-do-ambiente-de-teste'); });

const wavBytes = (): Uint8Array => {
  const data = new Uint8Array(512);
  const view = new DataView(data.buffer);
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) data[off + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); view.setUint32(4, 508, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, 464, true);
  return data;
};

type Ctx = { user: typeof schema.users.$inferSelect; org: typeof schema.orgs.$inferSelect; role: string; sessionId: string };
let db!: Awaited<ReturnType<typeof testDb>>;
let ctx!: Ctx;
let tmp!: string;
const ctxOf = (user: typeof ctx.user, org: typeof ctx.org): Ctx => ({ user, org, role: 'owner', sessionId: 'demo-test' });

afterAll(async () => { if (tmp) await fs.rm(tmp, { recursive: true, force: true }); });

beforeEach(async () => {
  db = await testDb();
  vi.mocked(getDb).mockResolvedValue(db);
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-demo-'));
  vi.stubEnv('VOICE_DEMO_DIR', tmp);
  const [u] = await db.insert(schema.users).values({ email: 'dono-demo@x.com', name: 'Dono Demo', status: 'active' }).returning();
  const orgId = await ensureDemo(db, u);
  const [o] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId));
  ctx = ctxOf(u, o);
  vi.mocked(requireOrg).mockResolvedValue(ctx as never);
});

test('demo é completa uma vez e já vem com caixa de conversas WhatsApp/Helpin clicáveis', async () => {
  const again = await ensureDemo(db, ctx.user);
  expect(again).toBe(ctx.org.id);
  const convs = await db.select().from(schema.helpinConversations).where(eq(schema.helpinConversations.orgId, ctx.org.id));
  const wa = convs.filter((c) => c.channel === 'whatsapp');
  expect(convs.length).toBe(5);
  expect(wa.length).toBe(3);
  expect(convs.every((c) => ['open', 'closed'].includes(c.status))).toBe(true);
  const msgs = await db.select().from(schema.helpinMessages).where(eq(schema.helpinMessages.orgId, ctx.org.id));
  expect(msgs.length).toBe(10);
  expect(msgs.filter((m) => m.sender === 'agent' && m.simulated).length).toBe(4);
  expect(msgs.filter((m) => m.sender === 'contact' && m.simulated).length).toBe(0);
});

test('Go LinkedIn na demo: conecta, testa e desconecta sem tocar a rede', async () => {
  const connected = await connectAccount(db, ctx.org.id, ctx.user.id, true, { session: 'x' });
  expect(connected.account.status).toBe('connected');
  expect(connected.account.demo).toBe(true);
  const tested = await testAccount(db, ctx.org.id, ctx.user.id, true);
  expect(tested.ok).toBe(true);
  const off = await disconnectAccount(db, ctx.org.id, ctx.user.id);
  expect(off?.status).toBe('disconnected');
});

test('fila: registrar lead novo gera ações pendentes na fila do dia (sem rede)', async () => {
  const [camp] = await db.select().from(schema.campaigns).where(and(eq(schema.campaigns.orgId, ctx.org.id), eq(schema.campaigns.name, 'Abertura · CFOs da indústria')));
  const [lead] = await db.insert(schema.leads).values({
    orgId: ctx.org.id, ownerId: ctx.user.id, fullName: 'Teste Fila E2E', stage: 'new', source: 'manual', tag: 'industria',
    linkedinUrl: 'https://www.linkedin.com/in/teste-fila-e2e-demo',
  }).returning();
  const before = (await db.select({ n: count() }).from(schema.actions).where(and(eq(schema.actions.orgId, ctx.org.id), eq(schema.actions.status, 'pending'))))[0].n;
  const r = await enrollLeads(db, ctx.org.id, camp.id, [lead.id]);
  expect(r.added).toBe(1);
  // é o scheduler (fila) que gera as ações vencidas; rodando na hora nenhuma rede é tocada
  const { runScheduler } = await import('@/lib/cadence');
  await runScheduler(db, { orgId: ctx.org.id });
  const after = (await db.select({ n: count() }).from(schema.actions).where(and(eq(schema.actions.orgId, ctx.org.id), eq(schema.actions.status, 'pending'))))[0].n;
  expect(after).toBe(before + 1);
});

test('Helpin: resposta sai simulada, conversa encerrada recusa e outra org não é encontrada', async () => {
  const [conv] = await db.select().from(schema.helpinConversations)
    .where(and(eq(schema.helpinConversations.orgId, ctx.org.id), eq(schema.helpinConversations.channel, 'whatsapp')))
    .limit(1);
  const f = (fold: FormData) => { const n = new FormData(); n.set('conversationId', fold.get('conversationId') as string); n.set('body', fold.get('body') as string); return n; };
  const a = new FormData(); a.set('conversationId', conv.id); a.set('body', 'Ótimo, envio em minutos.');
  const first = await replyAction(undefined, f(a));
  expect(first?.ok).toContain('simulada');
  const [msg] = await db.select().from(schema.helpinMessages).where(and(eq(schema.helpinMessages.conversationId, conv.id), eq(schema.helpinMessages.sender, 'agent')));
  expect(msg.simulated).toBe(true);
  // isolamento: conversa de outra organização não é encontrada
  const otherOrg = await db.insert(schema.orgs).values({ name: 'Outro Hub' }).returning();
  const otherConv = await db.insert(schema.helpinConversations).values({ orgId: otherOrg[0].id, contactName: 'X', channel: 'helpin', status: 'open' }).returning();
  const b = new FormData(); b.set('conversationId', otherConv[0].id); b.set('body', 'isolar');
  expect((await replyAction(undefined, f(b)))?.error).toBe('Conversa não encontrada.');
  // encerrada recusa
  await db.update(schema.helpinConversations).set({ status: 'closed' }).where(eq(schema.helpinConversations.id, conv.id));
  expect((await replyAction(undefined, f(a)))?.error).toContain('encerrada');
});

test('Agenda na demo: convite enfileirado e .ics válido', async () => {
  const slot = new Date('2026-11-12T15:00:00.000Z');
  const m = await createMeeting(db, ctx.org.id, ctx.user.id, { title: 'Diagnóstico', requesterName: 'Mariana Duarte', requesterEmail: 'm@example.test', slot, durationMin: 30 });
  const r = await sendMeetingInvite(db, m, { isDemo: true, mailbox: null });
  expect(r).toBe('queued');
  const [row] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, m.id));
  expect(row.icsState).toBe('queued');
  const ics = buildIcs(row);
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('DTSTART:20261112T150000Z');
});

test('voz na demo: cadastra ouve o áudio local e o envio real é recusado', async () => {
  const bytes = wavBytes();
  const form = new FormData();
  form.set('reference', new File([bytes as unknown as BlobPart], 'voz.wav', { type: 'audio/wav' }));
  form.set('transcript', 'Obrigado pelo aceite. Posso te mostrar como recuperamos seu imposto?');
  form.set('voiceConsent', 'on');
  const res = await demoRegisterVoiceAction(undefined, form);
  expect(res?.ok).toBeTruthy();
  const profile = await demoVoiceProfile(db, { orgId: ctx.org.id, userId: ctx.user.id });
  expect(profile?.engine).toBe('demo-local');
  const stored = await readDemoVoice(db, { orgId: ctx.org.id, userId: ctx.user.id });
  expect(stored).toEqual(bytes);
  // rota de áudio: 200 com magic RIFF e content-type correto
  const resp = await audioRoute();
  expect(resp.status).toBe(200);
  expect(resp.headers.get('Content-Type')).toBe('audio/wav');
  const served = new Uint8Array(await resp.arrayBuffer());
  expect(new TextDecoder().decode(served.slice(0, 4))).toBe('RIFF');
  // isolamento: outro usuário da mesma org não tem voz cadastrada → 404
  const [otherUser] = await db.insert(schema.users).values({ email: 'outro@x.com', name: 'Outro', status: 'active' }).returning();
  vi.mocked(requireOrg).mockResolvedValue({ ...ctx, user: otherUser } as never);
  expect(await readDemoVoice(db, { orgId: ctx.org.id, userId: otherUser.id })).toBeNull();
  expect((await audioRoute()).status).toBe(404);
  vi.mocked(requireOrg).mockResolvedValue(ctx as never);
  // recusa real de vazamento na demo: enfileirar voz real é bloqueado e nada sai
  const scope = { orgId: ctx.org.id, userId: ctx.user.id };
  await expect(queueVoiceDelivery(db, scope, { id: crypto.randomUUID(), recipient: '+5511999999999', text: 'Convite para reunião amanhã às 10h', kind: 'audio' })).rejects.toThrow('Voz automática indisponível');
  const [jobs] = await db.select({ n: count() }).from(schema.voiceJobs);
  expect(jobs.n).toBe(0);
});

test('Simulador: resposta no LinkedIn é gravada como ação simulada (sem envio real)', async () => {
  const [camp] = await db.select().from(schema.campaigns).where(and(eq(schema.campaigns.orgId, ctx.org.id), eq(schema.campaigns.name, 'Parcerias · Escritórios contábeis')));
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.orgId, ctx.org.id), eq(schema.leads.fullName, 'Camila Ferraz')));
  const r = await demoLinkedInReplyAction({ campaignId: camp.id, leadId: lead.id, body: 'Sim! Atendemos o Brasil inteiro.' });
  expect(r?.ok).toContain('simulada');
  const [act] = await db.select().from(schema.actions).where(and(eq(schema.actions.leadId, lead.id), eq(schema.actions.body, 'Sim! Atendemos o Brasil inteiro.')));
  expect(act.status).toBe('done');
  expect(act.providerId).toBe('demo-local');
  const [ev] = await db.select().from(schema.events).where(and(eq(schema.events.leadId, lead.id), eq(schema.events.type, 'message_sent')));
  expect(ev).toBeTruthy();
  // segunda resposta nunca colide com o passo anterior (índice único)
  const r2 = await demoLinkedInReplyAction({ campaignId: camp.id, leadId: lead.id, body: 'Segue material completo.' });
  expect(r2?.ok).toBeTruthy();
  const steps = await db.select().from(schema.actions).where(and(eq(schema.actions.leadId, lead.id), inArray(schema.actions.body, ['Sim! Atendemos o Brasil inteiro.', 'Segue material completo.'])));
  expect(steps.length).toBe(2);
  expect(new Set(steps.map((s) => s.stepIndex)).size).toBe(2);
});

test('fim da demonstração fim a fim: ZERO chamadas de rede externas', () => {
  expect(spyFetch).not.toHaveBeenCalled();
});
