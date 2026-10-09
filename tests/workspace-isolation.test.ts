import { beforeEach, describe, expect, it, vi } from 'vitest';
const blobs = vi.hoisted(() => new Map<string, string>());
vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (path: string) => blobs.has(path) ? { stream: new Blob([blobs.get(path)!]).stream() } : null),
  put: vi.fn(async (path: string, value: string) => { blobs.set(path, value); return {}; }),
}));
import { seedState } from '../src/data';
import { emptyWorkspace } from '../src/emptyWorkspace';
import { initialWorkspace, loadWorkspaceState, saveWorkspaceState, workspacePath } from '../server/api/_lib/workspace';
import workspaceHandler from '../server/api/workspace/state';
import organizationHandler from '../server/api/admin/organization';
import bridgeHandler from '../server/api/integrations/prospecting/bridge/tasks';
import whatsappHandler from '../server/api/integrations/whatsapp/send';
import { issueSession } from '../server/api/_lib/session';
import { verifyPassword } from '../server/api/_lib/crypto';
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
  return { method, headers: { host: 'localhost', cookie: String(result.headers['Set-Cookie']).split(';')[0] }, body };
}
beforeEach(() => {
  blobs.clear(); process.env.BLOB_READ_WRITE_TOKEN = 'test'; process.env.AUTH_SECRET = 'test-only-session-key';
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
