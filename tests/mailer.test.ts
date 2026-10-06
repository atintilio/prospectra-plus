import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendPasswordSetupEmail } from '../server/api/_lib/mailer.js';

describe('envio de convite por Office 365', () => {
  const previous = {
    tenant: process.env.MS_TENANT_ID,
    clientId: process.env.MS_CLIENT_ID,
    clientSecret: process.env.MS_CLIENT_SECRET,
    sender: process.env.OFFICE365_SENDER_EMAIL,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [key, value] of [
      ['MS_TENANT_ID', previous.tenant],
      ['MS_CLIENT_ID', previous.clientId],
      ['MS_CLIENT_SECRET', previous.clientSecret],
      ['OFFICE365_SENDER_EMAIL', previous.sender],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('envia para o endereço cadastrado, sem usar o remetente como fallback', async () => {
    process.env.MS_TENANT_ID = 'tenant';
    process.env.MS_CLIENT_ID = 'client';
    process.env.MS_CLIENT_SECRET = 'secret';
    process.env.OFFICE365_SENDER_EMAIL = 'atintilio@argusprime.com.br';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendPasswordSetupEmail('  Mloro@ArgusPrime.com.br  ', 'https://prospectra.argusprime.com.br/definir-senha?token=test', { recipientName: 'Moises Loro', invitation: true });

    const sendOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const payload = JSON.parse(String(sendOptions.body)) as { message: { toRecipients: Array<{ emailAddress: { address: string } }> } };
    expect(payload.message.toRecipients[0]?.emailAddress.address).toBe('mloro@argusprime.com.br');
    expect(payload.message.toRecipients[0]?.emailAddress.address).not.toBe('atintilio@argusprime.com.br');
  });
});
