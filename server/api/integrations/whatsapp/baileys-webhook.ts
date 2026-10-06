import { json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { loadWorkspaceState, saveWorkspaceState } from '../../_lib/workspace.js';

function sameSecret(received: string, expected: string) {
  return Boolean(received && expected && received === expected);
}

function digits(value: string) {
  return value.replace(/\D/g, '');
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const expected = process.env.BAILEYS_WEBHOOK_SECRET?.trim() ?? '';
  const received = Array.isArray(req.headers['x-prospectra-webhook-secret']) ? req.headers['x-prospectra-webhook-secret'][0] ?? '' : req.headers['x-prospectra-webhook-secret'] ?? '';
  if (!sameSecret(received, expected)) return json(res, 401, { error: 'baileys_webhook_unauthorized' });
  const body = parseBody(req);
  if (body.type !== 'message.received') return json(res, 200, { ok: true, ignored: true });
  const from = typeof body.from === 'string' ? digits(body.from) : '';
  if (!from) return json(res, 200, { ok: true, ignored: true });
  const workspace = await loadWorkspaceState();
  let changed = false;
  for (const account of workspace.state.accounts) {
    const contact = account.contacts.find((item) => item.phone && digits(item.phone) === from);
    if (!contact) continue;
    account.paused = true;
    account.activities = [{ id: crypto.randomUUID(), kind: 'Resposta', actor: 'Baileys Gateway', createdAt: new Date().toISOString(), text: `Resposta recebida no WhatsApp de ${contact.name}; tarefas pendentes pausadas automaticamente.` }, ...account.activities];
    changed = true;
  }
  if (changed) await saveWorkspaceState(workspace.state);
  return json(res, 200, { ok: true, paused: changed });
}
