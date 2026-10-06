import { requireActiveSession, requireSameOrigin } from '../../../_lib/access.js';
import { loadBridgeStore, requestBody, safeTask, saveBridgeStore } from '../../../_lib/bridge.js';
import { json, methodNotAllowed } from '../../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../../_lib/types.js';
import { loadWorkspaceState, visibleWorkspaceState } from '../../../_lib/workspace.js';

function approvedWriteTask(workspace: Awaited<ReturnType<typeof loadWorkspaceState>>, user: Parameters<typeof visibleWorkspaceState>[1], bridgeTask: ReturnType<typeof safeTask>) {
  if (!bridgeTask || (bridgeTask.action !== 'send_message' && bridgeTask.action !== 'send_connection') || !bridgeTask.campaignTaskId) return bridgeTask?.action === 'sync_profile' || bridgeTask?.action === 'sync_org_chart' || bridgeTask?.action === 'sync_inbox';
  const scoped = visibleWorkspaceState(workspace.state, user);
  const campaign = scoped.campaigns.find((item) => item.tasks.some((task) => task.id === bridgeTask.campaignTaskId));
  const task = campaign?.tasks.find((item) => item.id === bridgeTask.campaignTaskId);
  const account = scoped.accounts.find((item) => item.id === bridgeTask.accountId);
  const contact = account?.contacts.find((item) => item.id === bridgeTask.contactId);
  const approval = task?.approval;
  const evidenceIsValid = Boolean(approval?.evidenceIds.length && approval.evidenceIds.every((id) => account?.evidence.some((evidence) => evidence.id === id && evidence.verified)));
  return Boolean(campaign && task && account && contact && task.channel === 'LinkedIn' && task.accountId === account.id && task.contactId === contact.id && !account.paused && !account.suppressed && task.state !== 'Concluído' && campaign.copy.state === 'Aprovado' && approval && approval.copyRevision === campaign.copy.revision && approval.contactId === contact.id && approval.channel === 'LinkedIn' && evidenceIsValid && bridgeTask.message?.trim() === campaign.copy.text.trim());
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const context = await requireActiveSession(req, res);
  if (!context) return;
  try {
    if (req.method === 'GET') return json(res, 200, { ok: true, tasks: (await loadBridgeStore()).tasks.filter((task) => task.userId === context.user.id).slice(-100).reverse().map(({ userId: _userId, ...task }) => task) });
    if (req.method === 'POST') {
      if (!requireSameOrigin(req, res)) return;
      const task = safeTask(requestBody(req), context.user.id);
      if (!task) return json(res, 400, { error: 'invalid_bridge_task' });
      if (task.action === 'send_message' || task.action === 'send_connection') {
        if (!approvedWriteTask(await loadWorkspaceState(), context.user, task)) return json(res, 409, { error: 'bridge_task_not_approved' });
      }
      const store = await loadBridgeStore();
      if (task.deviceId && !store.devices.some((device) => device.id === task.deviceId && device.userId === context.user.id && device.active)) return json(res, 400, { error: 'bridge_device_not_found' });
      store.tasks.push(task); await saveBridgeStore(store);
      return json(res, 201, { ok: true, task: { ...task, userId: undefined } });
    }
    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return json(res, code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 503 : 500, { error: code === 'BRIDGE_STORAGE_NOT_CONFIGURED' ? 'bridge_storage_not_configured' : 'bridge_tasks_failed' });
  }
}
