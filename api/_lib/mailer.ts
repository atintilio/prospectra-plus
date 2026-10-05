function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
}

export async function sendPasswordSetupEmail(to: string, setupUrl: string): Promise<void> {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error('EMAIL_NOT_CONFIGURED');
  const baseUrl = (process.env.EMAIL_API_BASE_URL ?? 'https://api.resend.com').replace(/\/$/, '');
  const subject = 'Prospectra+ · crie sua senha de acesso';
  const text = `Olá,\n\nSeu usuário master do Prospectra+ está pronto. Crie sua senha neste link (válido por 15 minutos):\n\n${setupUrl}\n\nSe você não solicitou este acesso, ignore esta mensagem.`;
  const html = `<p>Olá,</p><p>Seu usuário master do Prospectra+ está pronto.</p><p><a href="${escapeHtml(setupUrl)}">Criar minha senha</a></p><p>O link é válido por 15 minutos e só pode ser usado uma vez.</p><p>Se você não solicitou este acesso, ignore esta mensagem.</p>`;
  const response = await fetch(`${baseUrl}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });
  if (!response.ok) throw new Error(`EMAIL_PROVIDER_${response.status}`);
}
