import { requireActiveSession, requireSameOrigin } from '../../_lib/access.js';
import { json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { loadWorkspaceState } from '../../_lib/workspace.js';
import { sendEvolutionText } from '../../../integrations/evolution.js';
import type { CampaignTask } from '../../../../src/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  if (!requireSameOrigin(req, res)) return;
  const body = parseBody(req);
  const taskId = typeof body.campaignTaskId === 'string' ? body.campaignTaskId : '';
  const accountId = typeof body.accountId === 'string' ? body.accountId : '';
  const contactId = typeof body.contactId === 'string' ? body.contactId : '';
  const number = typeof body.number === 'string' ? body.number : '';
  const text = typeof body.text === 'string' ? body.text : '';
  if (!taskId || !accountId || !contactId || !number || !text) return json(res, 400, { error: 'campaign_task_account_contact_number_text_required' });
  try {
    const workspace = await loadWorkspaceState();
    const campaign = workspace.state.campaigns.find((item) => item.tasks.some((task) => task.id === taskId));
    const task = campaign?.tasks.find((item) => item.id === taskId) as CampaignTask | undefined;
    const account = workspace.state.accounts.find((item) => item.id === accountId);
    const contact = account?.contacts.find((item) => item.id === contactId);
    if (!campaign || !task || !account || !contact || task.channel !== 'WhatsApp' || task.accountId !== accountId || task.contactId !== contactId) return json(res, 400, { error: 'whatsapp_task_mismatch' });
    if (campaign.copy.state !== 'Aprovado' || !task.approval || task.approval.copyRevision !== campaign.copy.revision || task.approval.contactId !== contactId || task.approval.channel !== 'WhatsApp' || task.approval.evidenceIds.length === 0) return json(res, 409, { error: 'whatsapp_task_not_approved' });
    if (account.paused || account.suppressed || task.state === 'Pausado' || task.state === 'Concluído') return json(res, 409, { error: 'whatsapp_task_blocked' });
    const receipt = await sendEvolutionText({ number, text });
    return json(res, 200, { ok: true, taskId, provider: 'Evolution API', receipt: { providerMessageId: receipt.providerMessageId, status: receipt.status } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'EVOLUTION_SEND_FAILED';
    if (code === 'EVOLUTION_INVALID_NUMBER' || code === 'EVOLUTION_INVALID_TEXT') return json(res, 400, { error: code.toLowerCase() });
    if (code.includes('NOT_CONFIGURED')) return json(res, 503, { error: 'evolution_not_configured' });
    const status = Number((error as { status?: number }).status);
    return json(res, status >= 400 && status < 600 ? status : 502, { error: 'evolution_send_failed' });
  }
}
