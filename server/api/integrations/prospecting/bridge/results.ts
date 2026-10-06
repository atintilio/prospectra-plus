import { requireBridgeDevice } from '../../../_lib/bridge.js';
import { json, methodNotAllowed, parseBody } from '../../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../../_lib/types.js';
import { saveBridgeStore } from '../../../_lib/bridge.js';
import { loadWorkspaceState, saveWorkspaceState } from '../../../_lib/workspace.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const context = await requireBridgeDevice(req, res);
  if (!context) return;
  try {
    const body = parseBody(req);
    const taskId = typeof body.taskId === 'string' ? body.taskId : '';
    const task = context.store.tasks.find((entry) => entry.id === taskId && entry.userId === context.user.id && entry.deviceId === context.device.id);
    if (!task) return json(res, 404, { error: 'bridge_task_not_found' });
    const state = body.state;
    if (!['success', 'failed', 'skipped'].includes(String(state))) return json(res, 400, { error: 'invalid_bridge_result' });
    task.state = state as typeof task.state; task.completedAt = new Date().toISOString();
    task.result = { providerStatus: typeof body.providerStatus === 'string' ? body.providerStatus : undefined, profile: body.profile, messages: body.messages, errorCode: typeof body.errorCode === 'string' ? body.errorCode : undefined, errorMessage: typeof body.errorMessage === 'string' ? body.errorMessage : undefined };
    if (state === 'success' && task.action === 'send_whatsapp' && task.campaignTaskId && task.accountId && task.contactId) {
      const workspace = await loadWorkspaceState();
      const campaign = workspace.state.campaigns.find((item) => item.tasks.some((candidate) => candidate.id === task.campaignTaskId));
      const campaignTask = campaign?.tasks.find((candidate) => candidate.id === task.campaignTaskId);
      const account = workspace.state.accounts.find((candidate) => candidate.id === task.accountId);
      const providerMessageId = typeof (body.profile as { providerMessageId?: unknown } | undefined)?.providerMessageId === 'string' ? (body.profile as { providerMessageId: string }).providerMessageId : undefined;
      if (!campaignTask || !account) return json(res, 500, { error: 'whatsapp_result_target_missing' });
      campaignTask.state = 'Concluído';
      campaignTask.providerMessageId = providerMessageId;
      campaignTask.providerStatus = typeof body.providerStatus === 'string' ? body.providerStatus : 'sent';
      campaignTask.completedAt = task.completedAt;
      account.activities = [{ id: crypto.randomUUID(), kind: 'Tarefa', actor: `Abridge · ${context.device.name}`, createdAt: task.completedAt, text: `Mensagem WhatsApp enviada localmente para o contato ${task.contactId}. Provider ID: ${providerMessageId ?? 'não informado'}.` }, ...account.activities];
      await saveWorkspaceState(workspace.state);
    }
    await saveBridgeStore(context.store);
    return json(res, 200, { ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return json(res, code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 503 : 500, { error: code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 'bridge_storage_not_configured' : 'bridge_result_failed' });
  }
}
