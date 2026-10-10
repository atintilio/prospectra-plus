import { beforeEach, describe, expect, it, vi } from 'vitest';
const blobs = vi.hoisted(() => new Map<string, string>());
vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (path: string) => blobs.has(path) ? { stream: new Blob([blobs.get(path)!]).stream(), blob: { etag: 'test-etag' } } : null),
  put: vi.fn(async (path: string, value: string) => { blobs.set(path, value); return {}; }),
}));
import { seedState } from '../src/data';
import { emptyWorkspace } from '../src/emptyWorkspace';
import { initialWorkspace, loadWorkspaceState, saveWorkspaceState, workspacePath } from '../server/api/_lib/workspace';
import workspaceHandler from '../server/api/workspace/state';
import loginHandler from '../server/api/auth/login';
import logoutHandler from '../server/api/auth/logout';
import meHandler from '../server/api/auth/me';
import organizationHandler from '../server/api/admin/organization';
import bridgeHandler from '../server/api/integrations/prospecting/bridge/tasks';
import whatsappHandler from '../server/api/integrations/whatsapp/send';
import { issueSession } from '../server/api/_lib/session';
import { verifyPassword, hashPassword } from '../server/api/_lib/crypto';
import type { ApiRequest, ApiResponse, AuthStore, StoredUser } from '../server/api/_lib/types';
const users: StoredUser[] = [
  { id: 'owner', email: 'owner@example.org', role: 'admin', passwordHash: null, active: true, createdAt: '', updatedAt: '' },
  { id: 'real-a', email: 'a@example.org', role: 'member', workspaceMode: 'production', passwordHash: null, active: true, createdAt: '', updatedAt: '' },
  { id: 'real-b', email: 'b@example.org', role: 'admin', workspaceMode: 'production', passwordHash: null, active: true, createdAt: '', updatedAt: '' },
  { id: 'demo', email: 'demo@example.org', role: 'admin', workspaceMode: 'demo', passwordHash: null, active: true, createdAt: '', updatedAt: '' },
];
function response() {
  const result = { code: 0, body: {} as any, headers: {} as Record<string, string | string[]> };
  const res: ApiResponse = { status(code) { result.code = code; return res; }, json(body) { result.body = body; }, setHeader(name, value) { result.headers[name] = value; return res; }, end() {} };
  return { result, res };
}
function request(user: StoredUser, method = 'GET', body?: unknown): ApiRequest {
  const { result, res } = response();
  issueSession(res, { headers: { host: 'localhost' } }, user);
  return { method, headers: { host: 'localhost', 'x-prospectra-session': user.workspaceMode === 'demo' ? 'demo' : 'production', cookie: String(result.headers['Set-Cookie']).split(';')[0] }, body };
}
beforeEach(() => {
  vi.unstubAllGlobals(); blobs.clear(); process.env.BLOB_READ_WRITE_TOKEN = 'test'; process.env.AUTH_SECRET = 'test-only-session-key';
  const store: AuthStore = { version: 1, users: structuredClone(users), teams: [], resets: [] };
  blobs.set('prospectra/auth.json', JSON.stringify(store));
  blobs.set(workspacePath(), JSON.stringify({ version: 1, updatedAt: 'legacy', state: seedState }));
});
describe('isolamento real e demonstração', () => {
  it('novas bases reais começam sem nenhum registro de exemplo', async () => {
    const state = (await loadWorkspaceState(users[1])).state;
    for (const key of ['accounts', 'campaigns', 'signals', 'teams', 'members', 'opportunities', 'diagnoses', 'playbook'] as const) expect(state[key]).toEqual([]);
    expect(state.selectedAccountId).toBe(''); expect(state.crmExtension?.fields).toEqual([]);
    expect(initialWorkspace().accounts).toEqual([]);
  });
  it('somente a demonstração recebe os exemplos, com cópias independentes', async () => {
    const demo = await loadWorkspaceState(users[3]);
    expect(demo.state.accounts.length).toBe(seedState.accounts.length);
    demo.state.accounts[0].name = 'Changed';
    expect(initialWorkspace(users[3]).accounts[0].name).toBe(seedState.accounts[0].name);
  });
  it('preserva o workspace legado sem migração destrutiva', async () => {
    expect((await loadWorkspaceState(users[0])).state).toEqual(seedState);
    expect(workspacePath(users[0])).toBe('prospectra/workspace-state.json');
  });
  it('gravações de uma conta nunca alteram outra conta ou os exemplos', async () => {
    const state = emptyWorkspace(); state.accounts = [structuredClone(seedState.accounts[0])];
    await saveWorkspaceState(state, users[1]);
    expect((await loadWorkspaceState(users[1])).state.accounts).toHaveLength(1);
    expect((await loadWorkspaceState(users[2])).state.accounts).toHaveLength(0);
    expect((await loadWorkspaceState(users[0])).updatedAt).toBe('legacy');
    expect((await loadWorkspaceState(users[3])).state.accounts.length).toBe(seedState.accounts.length);
    expect(workspacePath({ ...users[1], id: '../danger' })).not.toContain('../');
  });
  it('API autentica o escopo pelo cadastro e ignora escopos enviados pelo cliente', async () => {
    const state = emptyWorkspace(); state.accounts = [structuredClone(seedState.accounts[0])];
    const { res, result } = response();
    await workspaceHandler(request(users[1], 'PUT', { state, userId: 'real-b', workspaceMode: 'demo' }), res);
    expect(result.code).toBe(200);
    expect((await loadWorkspaceState(users[1])).state.accounts).toHaveLength(1);
    const other = response(); await workspaceHandler(request(users[2]), other.res);
    expect(other.result.body.state.accounts).toEqual([]); expect(other.result.body.state.members).toEqual([]);
  });
  it('novos cadastros recebem base vazia como padrão, mesmo administradores', async () => {
    const { res, result } = response();
    await organizationHandler(request(users[0], 'POST', { action: 'create-user', name: 'Real', email: 'new@example.org', role: 'admin' }), res);
    expect(result.code).toBe(201);
    const store = JSON.parse(blobs.get('prospectra/auth.json')!) as AuthStore;
    const user = store.users.find(u => u.email === 'new@example.org')!;
    expect(user.workspaceMode).toBe('production'); expect(initialWorkspace(user).accounts).toEqual([]);
  });
  it('senha de demonstração é somente hash salgado e não aparece na resposta', async () => {
    const password = 'test-demo-only***'; const { res, result } = response();
    await organizationHandler(request(users[0], 'POST', { action: 'create-user', name: 'Demo', email: 'new-demo@example.org', role: 'member', workspaceMode: 'demo', demoPassword: password }), res);
    expect(result.code).toBe(201);
    const saved = JSON.parse(blobs.get('prospectra/auth.json')!) as AuthStore;
    const user = saved.users.find(u => u.email === 'new-demo@example.org')!;
    expect(user.workspaceMode).toBe('demo'); expect(verifyPassword(password, user.passwordHash!)).toBe(true);
    expect(JSON.stringify(result.body)).not.toContain('passwordHash'); expect(blobs.get('prospectra/auth.json')).not.toContain(password);
  });
  it('administradores de bases individuais e demo não administram usuários globais', async () => {
    for (const user of [users[2], users[3]]) {
      const { res, result } = response(); await organizationHandler(request(user), res); expect(result.code).toBe(403);
    }
  });
  it('demonstração não dispara tarefas externas e não usa o WhatsApp compartilhado', async () => {
    const bridge = response(); await bridgeHandler(request(users[3], 'POST', { action: 'send_message' }), bridge.res);
    expect(bridge.result.code).toBe(403); expect(bridge.result.body.error).toBe('demo_external_actions_disabled');
    for (const user of [users[1], users[3]]) {
      const wa = response(); await whatsappHandler(request(user, 'POST', {}), wa.res);
      expect(wa.result.code).toBe(403);
    }
  });
});

it('participantes diferentes compartilham somente a base demo, com sessões individuais', async () => {
  const second = { ...users[3], id: 'demo-2', email: 'owner@example.org' };
  const store = JSON.parse(blobs.get('prospectra/auth.json')!) as AuthStore; store.users.push(second);
  blobs.set('prospectra/auth.json', JSON.stringify(store));
  expect(workspacePath(users[3])).toBe(workspacePath(second));
  const state = initialWorkspace(users[3]); state.accounts[0].name = 'Demo compartilhada';
  await saveWorkspaceState(state, users[3]);
  const demo = response(); await workspaceHandler(request(second), demo.res);
  expect(demo.result.code).toBe(200); expect(demo.result.body.state.accounts[0].name).toBe('Demo compartilhada');
  expect((await loadWorkspaceState(users[1])).state.accounts).toEqual([]);
  const req = request(second); delete req.headers['x-prospectra-session'];
  const prod = response(); await workspaceHandler(req, prod.res); expect(prod.result.code).toBe(401);
});

it('um email do Owner pode ter credenciais demo sem modificar a conta de produção', async () => {
  const ownerBefore = JSON.parse(blobs.get('prospectra/auth.json')!).users[0];
  const created = response();
  await organizationHandler(request(users[0], 'POST', {action:'create-user',name:'Owner demo',email:users[0].email,role:'member',workspaceMode:'demo',demoPassword:'test-pass***'}),created.res);
  expect(created.result.code).toBe(201);
  const store = JSON.parse(blobs.get('prospectra/auth.json')!) as AuthStore;
  expect(store.users.find(user => user.id === 'owner')).toEqual(ownerBefore);
  expect(store.users.filter(user => user.email === users[0].email)).toHaveLength(2);
});

it('login demo usa a senha pessoal e não aceita a senha do Owner de mesmo e-mail', async () => {
  const store = JSON.parse(blobs.get('prospectra/auth.json')!) as AuthStore;
  store.users[0].passwordHash = hashPassword('Production-password-1');
  const demo = {...users[3], id:'owner-demo',email:users[0].email,passwordHash:hashPassword('Demo-password-1')}; store.users.push(demo);
  blobs.set('prospectra/auth.json', JSON.stringify(store));
  const good = response(); await loginHandler({method:'POST',headers:{host:'localhost','x-prospectra-session':'demo'},body:{email:demo.email,password:'Demo-password-1'}},good.res);
  expect(good.result.code).toBe(200); expect(good.result.body.user.id).toBe('owner-demo');
  expect(good.result.headers['Set-Cookie']).toContain('prospectra_demo_session=');
  const wrong = response(); await loginHandler({method:'POST',headers:{host:'localhost','x-prospectra-session':'demo'},body:{email:demo.email,password:'Production-password-1'}},wrong.res);
  expect(wrong.result.code).toBe(401);
  const prod = response(); await loginHandler({method:'POST',headers:{host:'localhost'},body:{email:demo.email,password:'Demo-password-1'}},prod.res);
  expect(prod.result.code).toBe(401);
});

it('bloqueia após quatro senhas erradas, permite sair e relogar após desbloqueio', async () => {
  const store = JSON.parse(blobs.get('prospectra/auth.json')!) as AuthStore;
  store.users[0].passwordHash = hashPassword('Correct-password-1');
  blobs.set('prospectra/auth.json', JSON.stringify(store));
  const login = async (password: string) => {
    const reply = response();
    await loginHandler({ method: 'POST', headers: { host: 'localhost' }, body: { email: users[0].email, password } }, reply.res);
    return reply.result;
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await login('wrong-password');
    expect(result.code).toBe(401);
    expect(result.body.attemptsRemaining).toBe(4 - attempt);
  }
  const fourth = await login('wrong-password');
  expect(fourth.code).toBe(423);
  expect(Number(fourth.headers['Retry-After'])).toBeGreaterThan(0);
  expect((await login('Correct-password-1')).code).toBe(423);
  const lockPath = [...blobs.keys()].find((path) => path.startsWith('prospectra/login-attempts/'))!;
  blobs.set(lockPath, JSON.stringify({ failures: 4, firstFailedAt: Date.now() - 901_000, lockedUntil: Date.now() - 1 }));
  const success = await login('Correct-password-1');
  expect(success.code).toBe(200);
  const cookie = String(success.headers['Set-Cookie']).split(';')[0];
  const current = response();
  await meHandler({ method: 'GET', headers: { host: 'localhost', cookie } }, current.res);
  expect(current.result.code).toBe(200);
  const logout = response();
  logoutHandler({ method: 'POST', headers: { host: 'localhost', cookie } }, logout.res);
  expect(logout.result.code).toBe(200);
  expect(logout.result.headers['Set-Cookie']).toContain('Max-Age=0');
  expect((await login('Correct-password-1')).code).toBe(200);
});

function officeMock(accept: boolean) {
  process.env.OFFICE365_TENANT_ID='test-tenant'; process.env.OFFICE365_CLIENT_ID='test-client'; process.env.OFFICE365_CLIENT_SECRET='test-secret'; process.env.OFFICE365_SENDER_EMAIL='sender@example.org';
  const fetchMock = vi.fn(async (url: string) => url.includes('/oauth2/') ? new Response(JSON.stringify({access_token:'test-token'}),{status:200}) : new Response(null,{status:accept?202:503}));
  vi.stubGlobal('fetch',fetchMock); return fetchMock;
}
it('envia o acesso demo apenas aos destinatários selecionados após criar a conta', async () => {
  const fetchMock=officeMock(true); const created=response(); const password='test-demo***';
  await organizationHandler(request(users[0],'POST',{action:'create-user',name:'Demo mail',email:'mail-demo@example.org',role:'member',workspaceMode:'demo',demoPassword:password,demoRecipients:['mail-demo@example.org','recipient@example.org']}),created.res);
  expect(created.result.code).toBe(201); expect(created.result.body.demoAccessDelivery).toBe('accepted');
  const sent=JSON.parse((fetchMock.mock.calls[1] as unknown as [string,RequestInit])[1].body as string);
  expect(sent.message.toRecipients.map((r:any)=>r.emailAddress.address)).toEqual(['mail-demo@example.org','recipient@example.org']);
  expect(sent.message.body.content).toContain(password); expect(sent.message.body.content).toContain('/demo');
  expect(blobs.get('prospectra/auth.json')).not.toContain(password); expect(JSON.stringify(created.result.body)).not.toContain(password);
});
it('rejeição de e-mail não apaga a conta criada nem simula envio bem sucedido', async () => {
  officeMock(false); const created=response();
  await organizationHandler(request(users[0],'POST',{action:'create-user',name:'Demo mail',email:'mail-demo@example.org',role:'member',workspaceMode:'demo',demoPassword:'test-demo***',demoRecipients:['recipient@example.org']}),created.res);
  expect(created.result.code).toBe(201); expect(created.result.body.demoAccessDelivery).toBe('failed');
  expect(JSON.parse(blobs.get('prospectra/auth.json')!).users.some((u:any)=>u.email==='mail-demo@example.org')).toBe(true);
});
