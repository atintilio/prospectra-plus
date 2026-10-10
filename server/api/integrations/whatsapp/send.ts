import { requireActiveSession, requireSameOrigin } from '../../_lib/access.js';
import { json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';
import { loadWorkspaceState, mutateWorkspaceState, visibleWorkspaceState } from '../../_lib/workspace.js';
import { baileysConfigured, baileysStatus, normalizeBaileysNumber, sendBaileysText } from '../../../integrations/baileys.js';
import { activeWhatsAppProvider } from '../../../integrations/whatsapp-provider.js';
import { normalizeWhatsappNumber, sendEvolutionText } from '../../../integrations/evolution.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  if (context.user.workspaceMode === 'demo') return json(res, 403, { error: 'demo_external_actions_disabled' });
  if (!requireSameOrigin(req, res)) return;
  const provider = activeWhatsAppProvider();
  if (provider === 'evolution' && context.user.workspaceMode) return json(res, 403, { error: 'shared_gateway_access_disabled' });
  const body = parseBody(req);
  const taskId = typeof body.campaignTaskId === 'string' ? body.campaignTaskId : '';
  const accountId = typeof body.accountId === 'string' ? body.accountId : '';
  const contactId = typeof body.contactId === 'string' ? body.contactId : '';
  const number = typeof body.number === 'string' ? body.number : '';
  const text = typeof body.text === 'string' ? body.text : '';
  if (!taskId || !accountId || !contactId || !number || !text) return json(res, 400, { error: 'campaign_task_account_contact_number_text_required' });
  try {
    const workspace = await loadWorkspaceState(context.user);
    const scoped = visibleWorkspaceState(workspace.state, context.user);
    const campaign = scoped.campaigns.find((item) => item.tasks.some((task) => task.id === taskId));
    const task = campaign?.tasks.find((item) => item.id === taskId);
    const account = scoped.accounts.find((item) => item.id === accountId);
    const contact = account?.contacts.find((item) => item.id === contactId);
    if (!campaign || !task || !account || !contact || task.channel !== 'WhatsApp' || task.accountId !== accountId || task.contactId !== contactId) return json(res, 400, { error: 'whatsapp_task_mismatch' });
    if (task.providerMessageId && task.state === 'Concluído') return json(res, 200, { ok: true, alreadySent: true, taskId, provider, receipt: { providerMessageId: task.providerMessageId, status: 'sent' } });
    const approval = task.approval;
    const evidenceIds = approval?.evidenceIds ?? [];
    if (campaign.copy.state !== 'Aprovado' || !approval || approval.copyRevision !== campaign.copy.revision || approval.contactId !== contactId || approval.channel !== 'WhatsApp' || !evidenceIds.length || !evidenceIds.every((id) => account.evidence.some((evidence) => evidence.id === id && evidence.verified))) return json(res, 409, { error: 'whatsapp_task_not_approved' });
    if (account.paused || account.suppressed || task.state === 'Pausado' || task.state === 'Concluído' || task.providerStatus === 'sending') return json(res, 409, { error: 'whatsapp_task_blocked' });
    if (contact.optIn !== true) return json(res, 409, { error: 'whatsapp_opt_in_required' });
    const normalized = provider === 'baileys' ? normalizeBaileysNumber : normalizeWhatsappNumber;
    const expectedNumber = normalized(contact.phone ?? '');
    if (expectedNumber !== normalized(number)) return json(res, 409, { error: 'whatsapp_number_mismatch' });
    if (text.trim() !== campaign.copy.text.trim()) return json(res, 409, { error: 'whatsapp_copy_mismatch' });
    if (provider === 'baileys') {
      if (!baileysConfigured()) return json(res, 503, { error: 'baileys_not_configured' });
      const status = await baileysStatus(context.user);
      if (status.connected !== true) return json(res, 409, { error: 'baileys_not_connected' });
    }
    await mutateWorkspaceState(context.user, (state) => {
      const latestCampaign = state.campaigns.find((item) => item.id === campaign.id);
      const latestTask = latestCampaign?.tasks.find((item) => item.id === task.id);
      const latestAccount = state.accounts.find((item) => item.id === account.id);
      const latestContact = latestAccount?.contacts.find((item) => item.id === contact.id);
      if (!latestCampaign || !latestTask || !latestAccount || !latestContact || latestAccount.paused || latestAccount.suppressed || latestTask.state === 'Pausado' || latestTask.state === 'Concluído' || latestTask.providerStatus === 'sending' || latestContact.optIn !== true || latestCampaign.copy.state !== 'Aprovado' || latestCampaign.copy.revision !== approval.copyRevision || latestCampaign.copy.text.trim() !== text.trim()) throw new Error('WHATSAPP_TASK_CHANGED');
      latestTask.providerStatus = 'sending';
      return state;
    });
    const receipt = provider === 'baileys' ? await sendBaileysText({ number: expectedNumber, text: campaign.copy.text, user: context.user }) : await sendEvolutionText({ number: expectedNumber, text: campaign.copy.text });
    if (receipt.status !== 'sent' || !receipt.providerMessageId) return json(res, 502, { error: 'whatsapp_delivery_unknown' });
    try {
      await mutateWorkspaceState(context.user, (state) => {
        const latestTask = state.campaigns.find((item) => item.id === campaign.id)?.tasks.find((item) => item.id === task.id);
        const latestAccount = state.accounts.find((item) => item.id === account.id);
        if (!latestTask || !latestAccount) throw new Error('WHATSAPP_RECEIPT_TARGET_MISSING');
        if (latestTask.providerMessageId === receipt.providerMessageId) return null;
        latestTask.state = 'Concluído'; latestTask.providerMessageId = receipt.providerMessageId; latestTask.providerStatus = 'sent'; latestTask.completedAt = new Date().toISOString();
        const activityId = `whatsapp-${receipt.providerMessageId}`;
        if (!latestAccount.activities.some((activity) => activity.id === activityId)) latestAccount.activities.unshift({ id: activityId, kind: 'Tarefa', actor: context.user.email, createdAt: latestTask.completedAt, text: `Mensagem WhatsApp aceita pelo ${provider} para ${contact.name}. Provider ID: ${receipt.providerMessageId}.` });
        return state;
      });
    } catch { return json(res, 502, { error: 'whatsapp_receipt_persistence_failed' }); }
    return json(res, 200, { ok: true, taskId, provider, receipt: { providerMessageId: receipt.providerMessageId, status: 'sent' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'WHATSAPP_TASK_CHANGED') return json(res, 409, { error: 'whatsapp_task_changed' });
    if (code.includes('INVALID_NUMBER') || code.includes('INVALID_TEXT')) return json(res, 400, { error: code.toLowerCase() });
    if (code.includes('NOT_CONFIGURED')) return json(res, 503, { error: `${provider}_not_configured` });
    const status = Number((error as { status?: number }).status);
    return json(res, status >= 400 && status < 600 ? status : 502, { error: 'whatsapp_send_failed_or_unconfirmed' });
  }
}
