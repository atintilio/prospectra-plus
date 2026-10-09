function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
}

function requiredAny(label: string, ...names: string[]): string {
  const value = names.map((name) => process.env[name]?.trim()).find(Boolean);
  if (!value) throw new Error(`OFFICE365_${label}_NOT_CONFIGURED`);
  return value;
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
  const token = await accessToken();
  const recipient = escapeHtml(options.recipientName?.trim() || '');
  const isInvite = options.invitation === true;
  const subject = isInvite ? 'Prospectra+ · seu acesso foi liberado' : 'Prospectra+ · crie ou recupere sua senha';
  const introduction = isInvite ? 'Seu acesso ao Prospectra+ foi liberado pela administração do workspace.' : 'Recebemos uma solicitação para criar ou recuperar sua senha de acesso ao Prospectra+.';
  const html = `<p>Olá${recipient ? `, ${recipient}` : ''},</p><p>${introduction}</p><p><a href="${escapeHtml(setupUrl)}">${isInvite ? 'Criar minha senha' : 'Definir nova senha'}</a></p><p>O link é válido por 15 minutos e só pode ser usado uma única vez.</p><p>Se você não solicitou este acesso, ignore esta mensagem.</p>`;
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }),
  });
  if (!response.ok) throw new Error(`OFFICE365_SEND_FAILED_${response.status}`);
}

/** Sends only explicitly selected demo access; the password is never persisted or logged. */
export async function sendDemoAccessEmail(to: string[], login: string, password: string, appUrl: string): Promise<void> {
  const sender = requiredAny('SENDER_EMAIL', 'OFFICE365_SENDER_EMAIL', 'MS_GRAPH_USER_ID', 'MAIL_FROM');
  const token = await accessToken();
  const html = `<p>Olá,</p><p>Suas credenciais pessoais para a demonstração do Prospectra+ estão disponíveis.</p><p><a href="${escapeHtml(appUrl)}">Abrir Prospectra+</a></p><p>Login: <strong>${escapeHtml(login)}</strong><br>Senha: <strong>${escapeHtml(password)}</strong></p><p>Esta conta contém exemplos fictícios e não envia mensagens nem conecta canais externos. Todos os participantes da demonstração compartilham a mesma base de exemplos. Contas reais de produção têm bases separadas e começam vazias.</p>`;
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { subject: 'Prospectra+ · login da demonstração compartilhada', body: { contentType: 'HTML', content: html }, toRecipients: to.map(address => ({ emailAddress: { address } })) }, saveToSentItems: true }),
  });
  if (!response.ok) throw new Error(`OFFICE365_SEND_FAILED_${response.status}`);
}

/** Sends a harmless owner-requested delivery probe; it never contains credentials. */
export async function sendTestEmail(to: string[]): Promise<void> {
  const sender = requiredAny('SENDER_EMAIL', 'OFFICE365_SENDER_EMAIL', 'MS_GRAPH_USER_ID', 'MAIL_FROM');
  const token = await accessToken();
  const html = '<p>Este é um teste de entrega do Prospectra+.</p><p>O fluxo de campanhas, rastreamento e jobs está sendo validado. Nenhuma ação comercial foi disparada.</p><p>Horário do teste: ' + escapeHtml(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })) + '</p>';
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { subject: 'Prospectra+ · teste de entrega', body: { contentType: 'HTML', content: html }, toRecipients: to.map(address => ({ emailAddress: { address } })) }, saveToSentItems: true }),
  });
  if (!response.ok) throw new Error(`OFFICE365_SEND_FAILED_${response.status}`);
}
