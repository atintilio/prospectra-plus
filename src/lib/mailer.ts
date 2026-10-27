import 'server-only';

// Envio pelo Office 365 da Argus (Microsoft Graph, permissão de aplicativo Mail.Send).
// Reaproveitado do Prospectra+ v1, que já estava validado em produção.

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c] ?? c);
}

function env(...names: string[]): string | undefined {
  return names.map((n) => process.env[n]?.trim()).find(Boolean);
}

export function mailerConfigured(): boolean {
  return Boolean(
    env('OFFICE365_TENANT_ID', 'MS_TENANT_ID') && env('OFFICE365_CLIENT_ID', 'MS_CLIENT_ID') &&
    env('OFFICE365_CLIENT_SECRET', 'MS_CLIENT_SECRET') && env('OFFICE365_SENDER_EMAIL', 'MS_GRAPH_USER_ID', 'MAIL_FROM'),
  );
}

async function accessToken(): Promise<string> {
  const tenant = env('OFFICE365_TENANT_ID', 'MS_TENANT_ID');
  const clientId = env('OFFICE365_CLIENT_ID', 'MS_CLIENT_ID');
  const clientSecret = env('OFFICE365_CLIENT_SECRET', 'MS_CLIENT_SECRET');
  if (!tenant || !clientId || !clientSecret) throw new Error('OFFICE365_NOT_CONFIGURED');
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !data.access_token) throw new Error(`OFFICE365_TOKEN_FAILED_${res.status}`);
  return data.access_token;
}

function layout(title: string, body: string): string {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#080809">
  <div style="padding:20px 0;border-bottom:1px solid #e5e7eb"><strong style="font-size:18px">Prospectra</strong>
  <span style="color:#5c5f66"> · Argus Prime</span></div>
  <h1 style="font-size:20px;font-weight:600;margin:24px 0 12px">${title}</h1>${body}
  <p style="color:#5c5f66;font-size:12px;margin-top:32px">Se você não esperava este e-mail, pode ignorá-lo.</p></div>`;
}

export async function sendAccessEmail(to: string, link: string, opts: { name?: string; kind: 'invite' | 'reset'; orgName?: string }): Promise<void> {
  const sender = env('OFFICE365_SENDER_EMAIL', 'MS_GRAPH_USER_ID', 'MAIL_FROM');
  if (!sender) throw new Error('OFFICE365_NOT_CONFIGURED');
  const token = await accessToken();
  const hello = opts.name ? `Olá, ${escapeHtml(opts.name)}.` : 'Olá.';
  const isInvite = opts.kind === 'invite';
  const subject = isInvite ? 'Seu acesso ao Prospectra foi liberado' : 'Prospectra · defina sua senha';
  const intro = isInvite
    ? `Você foi convidado para o Prospectra${opts.orgName ? ` na equipe <strong>${escapeHtml(opts.orgName)}</strong>` : ''}.`
    : 'Recebemos um pedido para definir ou recuperar sua senha.';
  const html = layout(isInvite ? 'Bem-vindo ao Prospectra' : 'Definir senha', `<p>${hello}</p><p>${intro}</p>
    <p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#155dfc;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${isInvite ? 'Criar minha senha' : 'Definir nova senha'}</a></p>
    <p style="color:#5c5f66;font-size:13px">O link vale por ${isInvite ? '7 dias' : '30 minutos'} e só pode ser usado uma vez.</p>`);
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }),
  });
  if (!res.ok) throw new Error(`OFFICE365_SEND_FAILED_${res.status}`);
}


export async function sendDeletionReport(report: { id: string; actorEmail: string; orgName: string; createdAt: Date; records: { id: string; name: string }[] }): Promise<void> {
  const sender = env('OFFICE365_SENDER_EMAIL', 'MS_GRAPH_USER_ID', 'MAIL_FROM');
  if (!sender) throw new Error('OFFICE365_NOT_CONFIGURED');
  const token = await accessToken();
  const to = process.env.MASTER_USER_EMAIL || 'atintilio@argusprime.com.br';
  const content = `<p>Exclusão registrada no Prospectra.</p><p>Responsável: ${escapeHtml(report.actorEmail)}<br>Equipe: ${escapeHtml(report.orgName)}<br>Data: ${escapeHtml(report.createdAt.toISOString())}<br>Registro: ${escapeHtml(report.id)}</p><ul>${report.records.map(r => `<li>${escapeHtml(r.name)} — ${escapeHtml(r.id)}</li>`).join('')}</ul>`;
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { subject: `Prospectra · exclusão de ${report.records.length} registro(s)`, body: { contentType: 'HTML', content }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }),
  });
  if (!res.ok) throw new Error(`OFFICE365_SEND_FAILED_${res.status}`);
}

export async function sendCommercialNotification(recipients:string[],body:string):Promise<void>{
  const allowed=new Set(['atintilio@argusprime.com.br','mloro@argusprime.com.br']);
  if(!recipients.length||recipients.some(to=>!allowed.has(to)))throw Error('COMMERCIAL_RECIPIENT_INVALID');
  const sender=env('OFFICE365_SENDER_EMAIL','MS_GRAPH_USER_ID','MAIL_FROM');
  if(!sender)throw Error('OFFICE365_NOT_CONFIGURED');
  const token=await accessToken();
  const response=await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
    body:JSON.stringify({message:{subject:'Prospectra+ · conversa comercial para assumir',body:{contentType:'Text',content:body},toRecipients:recipients.map(address=>({emailAddress:{address}}))},saveToSentItems:true}),
  });
  if(!response.ok)throw Error(`OFFICE365_SEND_FAILED_${response.status}`);
}
