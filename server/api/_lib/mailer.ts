function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
}

function requiredAny(label: string, ...names: string[]): string {
  const value = names.map((name) => process.env[name]?.trim()).find(Boolean);
  if (!value) throw new Error(`OFFICE365_${label}_NOT_CONFIGURED`);
  return value;
}

function normalizeRecipient(value: string): string {
  const recipient = value.trim().toLowerCase();
  if (!recipient || recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error('OFFICE365_RECIPIENT_INVALID');
  }
  return recipient;
}

async function accessToken(): Promise<string> {
  const tenant = requiredAny('TENANT_ID', 'OFFICE365_TENANT_ID', 'MS_TENANT_ID');
  const clientId = requiredAny('CLIENT_ID', 'OFFICE365_CLIENT_ID', 'MS_CLIENT_ID');
  const clientSecret = requiredAny('CLIENT_SECRET', 'OFFICE365_CLIENT_SECRET', 'MS_CLIENT_SECRET');
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string };
  if (!response.ok || !data.access_token) throw new Error(`OFFICE365_TOKEN_FAILED_${response.status}`);
  return data.access_token;
}

export async function sendPasswordSetupEmail(
  to: string,
  setupUrl: string,
  options: { recipientName?: string; invitation?: boolean } = {},
): Promise<void> {
  const sender = requiredAny('SENDER_EMAIL', 'OFFICE365_SENDER_EMAIL', 'MS_GRAPH_USER_ID', 'MAIL_FROM');
  const recipientAddress = normalizeRecipient(to);
  const token = await accessToken();
  const recipient = escapeHtml(options.recipientName?.trim() || '');
  const isInvite = options.invitation === true;
  const subject = isInvite ? 'Prospectra+ · seu acesso foi liberado' : 'Prospectra+ · crie ou recupere sua senha';
  const introduction = isInvite ? 'Seu acesso ao Prospectra+ foi liberado pela administração do workspace.' : 'Recebemos uma solicitação para criar ou recuperar sua senha de acesso ao Prospectra+.';
  const html = `<p>Olá${recipient ? `, ${recipient}` : ''},</p><p>${introduction}</p><p><a href="${escapeHtml(setupUrl)}">${isInvite ? 'Criar minha senha' : 'Definir nova senha'}</a></p><p>O link é válido por 15 minutos e só pode ser usado uma única vez.</p><p>Se você não solicitou este acesso, ignore esta mensagem.</p>`;
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: recipientAddress } }] }, saveToSentItems: true }),
  });
  if (!response.ok) throw new Error(`OFFICE365_SEND_FAILED_${response.status}`);
}
