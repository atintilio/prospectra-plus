import { count, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import * as schema from '@/db/schema';
import { connectAccount, disconnectAccount, getMyAccount, setAccountStatus, testAccount, verifyLinkedInSession } from '@/lib/linkedin';
import { seedOrg, testDb } from './helpers';

beforeEach(() => {
  // Nenhum teste do Go LinkedIn pode tocar a rede: qualquer fetch é um erro de teste.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('REDE_PROIBIDA_EM_TESTE'); }));
  vi.stubEnv('SECRETS_KEY', 'chave-oficial-do-ambiente-de-teste');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('produção: sessão confirmada no LinkedIn vira connected e nunca salva em texto puro', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'ProdOrg');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, url: 'https://www.linkedin.com/feed/', status: 200 }) as unknown as Response));
  const { account, message } = await connectAccount(db, org.id, user.id, false, { session: 'b=cookie:v=secreta' });
  expect(account.status).toBe('connected');
  expect(message).toBe('Conta conectada.');
  expect(account.sessionEnc).toBeTruthy();
  expect(account.sessionEnc).not.toContain('secreta');
  expect(decryptSecret(account.sessionEnc)).toBe('b=cookie:v=secreta');
});

test('produção: sessão inválida fica expired e sem connectedAt', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'ProdOrg2');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, url: 'https://www.linkedin.com/login', status: 302 }) as unknown as Response));
  const { account } = await connectAccount(db, org.id, user.id, false, { session: 'sessao-ruim' });
  expect(account.status).toBe('expired');
  expect(account.connectedAt).toBeNull();
});

test('produção: segredo não configurado bloqueia conexão com sessão informada', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'SemSegredo');
  vi.stubEnv('SECRETS_KEY', '');
  await expect(connectAccount(db, org.id, user.id, false, { session: 'x' })).rejects.toThrow('SECRETS_KEY_NOT_CONFIGURED');
});

test('produção: sem sessão informada fica aguardando conexão', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'Aguardando');
  const { account, message } = await connectAccount(db, org.id, user.id, false, {});
  expect(account.status).toBe('waiting');
  expect(message).toContain('aguardando');
});

test('demo: conexão simulada, uma conta por usuário, e nada na rede', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'DemoOrg');
  const first = await connectAccount(db, org.id, user.id, true, { session: 'qualquer' });
  expect(first.account.status).toBe('connected');
  expect(first.account.demo).toBe(true);
  const again = await connectAccount(db, org.id, user.id, true, {});
  expect(again.account.id).toBe(first.account.id);
  const rows = await db.select().from(schema.linkedinAccounts).where(eq(schema.linkedinAccounts.orgId, org.id));
  expect(rows).toHaveLength(1);
});

test('demo: teste e desconexão são simulados e limpam a sessão', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'DemoTesta');
  await connectAccount(db, org.id, user.id, true, {});
  const tested = await testAccount(db, org.id, user.id, true);
  expect(tested.ok).toBe(true);
  expect(tested.message).toContain('Simulação');
  const off = await disconnectAccount(db, org.id, user.id);
  expect(off?.status).toBe('disconnected');
  expect(off?.sessionEnc).toBeNull();
  const again = await testAccount(db, org.id, user.id, true);
  expect(again.ok).toBe(false);
});

test('isolamento: status do worker só muda a conta da mesma organização', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'OrgA');
  const b = await seedOrg(db, 'OrgB');
  const { account } = await connectAccount(db, a.org.id, a.user.id, true, {});
  expect(await setAccountStatus(db, account.id, b.org.id, 'blocked')).toBeUndefined();
  expect((await getMyAccount(db, a.org.id, a.user.id))?.status).toBe('connected');
  const changed = await setAccountStatus(db, account.id, a.org.id, 'blocked');
  expect(changed?.status).toBe('blocked');
  const two = await db.select({ n: count() }).from(schema.linkedinAccounts);
  expect(two[0].n).toBe(1);
});

test('sessões cifradas com chaves diferentes não se revelam (AES-256-GCM)', () => {
  vi.stubEnv('SECRETS_KEY', 'k1-0123456789');
  const blob = encryptSecret('meu-cookie-do-linkedin');
  expect(blob === 'meu-cookie-do-linkedin').toBe(false);
  expect(decryptSecret(blob)).toBe('meu-cookie-do-linkedin');
  vi.stubEnv('SECRETS_KEY', 'k2-9876543210');
  expect(decryptSecret(blob)).toBeNull();
});

test('verifyLinkedInSession: rede indisponível não conecta a conta', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
  await expect(verifyLinkedInSession('qualquer')).resolves.toBe('expired');
});
