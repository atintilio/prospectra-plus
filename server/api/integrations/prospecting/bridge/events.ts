import { requireBridgeDevice } from '../../../_lib/bridge.js';
import { json, methodNotAllowed, parseBody } from '../../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../../_lib/types.js';
import { loadWorkspaceState, saveWorkspaceState } from '../../../_lib/workspace.js';

function digits(value: string) { return value.replace(/\D/g, ''); }
function samePhone(left: string, right: string) {
  const a = digits(left);
  const b = digits(right);
  return Boolean(a && b && (a === b || a.slice(-10) === b.slice(-10)));
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const context = await requireBridgeDevice(req, res);
  if (!context) return;
  try {
    const body = parseBody(req);
    if (body.type !== 'message.received' || typeof body.from !== 'string' || !body.from.trim()) return json(res, 400, { error: 'invalid_bridge_event' });
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : '';
    const workspace = await loadWorkspaceState();
    const matches = workspace.state.accounts.filter((account) => account.contacts.some((contact) => contact.phone && samePhone(contact.phone, body.from as string)));
    if (!matches.length) return json(res, 200, { ok: true, matched: false });
    const now = new Date().toISOString();
    const matchedIds = new Set(matches.map((account) => account.id));
    for (const account of matches) {
      account.paused = true;
      account.activities = [{ id: crypto.randomUUID(), kind: 'Resposta', actor: `WhatsApp · ${context.device.name}`, createdAt: now, text: `Resposta recebida no WhatsApp${text ? `: ${text}` : '.'} A conta foi pausada automaticamente para revisão humana.` }, ...account.activities];
    }
    for (const campaign of workspace.state.campaigns) {
      for (const task of campaign.tasks) {
        if (matchedIds.has(task.accountId) && task.state !== 'Concluído') task.state = 'Pausado';
      }
    }
    await saveWorkspaceState(workspace.state);
    return json(res, 200, { ok: true, matched: true, accountIds: [...matchedIds] });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return json(res, code === 'BRIDGE_STORAGE_NOT_CONFIGURED' || code === 'WORKSPACE_STORAGE_NOT_CONFIGURED' ? 503 : 500, { error: code || 'bridge_event_failed' });
  }
}
