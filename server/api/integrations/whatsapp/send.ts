import { requireActiveSession, requireSameOrigin } from '../../_lib/access.js';
import { json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { loadWorkspaceState, saveWorkspaceState, visibleWorkspaceState } from '../../_lib/workspace.js';
import { normalizeWhatsappNumber, sendEvolutionText } from '../../../integrations/evolution.js';
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
    const scoped = visibleWorkspaceState(workspace.state, context.user);
    if (!scoped.accounts.some((account) => account.id === accountId)) return json(res, 403, { error: 'whatsapp_task_out_of_scope' });
    const campaign = scoped.campaigns.find((item) => item.tasks.some((task) => task.id === taskId));
    const task = campaign?.tasks.find((item) => item.id === taskId) as CampaignTask | undefined;
    const account = scoped.accounts.find((item) => item.id === accountId);
    const contact = account?.contacts.find((item) => item.id === contactId);
    if (!campaign || !task || !account || !contact || task.channel !== 'WhatsApp' || task.accountId !== accountId || task.contactId !== contactId) return json(res, 400, { error: 'whatsapp_task_mismatch' });
    if (task.providerMessageId && task.state === 'Concluído') return json(res, 200, { ok: true, alreadySent: true, taskId, provider: 'Evolution API', receipt: { providerMessageId: task.providerMessageId, status: task.providerStatus ?? 'sent' } });
    const approval = task.approval;
    const evidenceIds = approval?.evidenceIds ?? [];
    const evidenceIsValid = evidenceIds.length > 0 && evidenceIds.every((id) => account.evidence.some((evidence) => evidence.id === id && evidence.verified));
    if (campaign.copy.state !== 'Aprovado' || !approval || approval.copyRevision !== campaign.copy.revision || approval.contactId !== contactId || approval.channel !== 'WhatsApp' || !evidenceIsValid) return json(res, 409, { error: 'whatsapp_task_not_approved' });
    if (account.paused || account.suppressed || task.state === 'Pausado' || task.state === 'Concluído') return json(res, 409, { error: 'whatsapp_task_blocked' });
    const expectedNumber = normalizeWhatsappNumber(contact.phone ?? '');
    const suppliedNumber = normalizeWhatsappNumber(number);
    if (expectedNumber !== suppliedNumber) return json(res, 409, { error: 'whatsapp_number_mismatch' });
    if (text.trim() !== campaign.copy.text.trim()) return json(res, 409, { error: 'whatsapp_copy_mismatch' });
    const receipt = await sendEvolutionText({ number: expectedNumber, text: campaign.copy.text });
    if (receipt.status !== 'sent' || !receipt.providerMessageId) return json(res, 502, { error: 'evolution_delivery_unknown' });
    const rawCampaign = workspace.state.campaigns.find((item) => item.id === campaign.id);
    const rawTask = rawCampaign?.tasks.find((item) => item.id === task.id);
    const rawAccount = workspace.state.accounts.find((item) => item.id === account.id);
    if (!rawTask || !rawAccount) return json(res, 500, { error: 'whatsapp_receipt_target_missing' });
    rawTask.state = 'Concluído'; rawTask.providerMessageId = receipt.providerMessageId; rawTask.providerStatus = receipt.status; rawTask.completedAt = new Date().toISOString();
    rawAccount.activities = [{ id: crypto.randomUUID(), kind: 'Tarefa', actor: context.user.email, createdAt: new Date().toISOString(), text: `Mensagem WhatsApp enviada pela Evolution API para ${contact.name}. Provider ID: ${receipt.providerMessageId}.` }, ...rawAccount.activities];
    try { await saveWorkspaceState(workspace.state); } catch { return json(res, 502, { error: 'evolution_receipt_persistence_failed' }); }
    return json(res, 200, { ok: true, taskId, provider: 'Evolution API', receipt: { providerMessageId: receipt.providerMessageId, status: receipt.status } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'EVOLUTION_SEND_FAILED';
    if (code === 'EVOLUTION_INVALID_NUMBER' || code === 'EVOLUTION_INVALID_TEXT') return json(res, 400, { error: code.toLowerCase() });
    if (code.includes('NOT_CONFIGURED')) return json(res, 503, { error: 'evolution_not_configured' });
    const status = Number((error as { status?: number }).status);
    return json(res, status >= 400 && status < 600 ? status : 502, { error: 'evolution_send_failed' });
  }
}
