import { afterEach, expect, test, vi } from 'vitest';
import { sendCalendarInvite } from '@/lib/mailer';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('sendCalendarInvite envia o convite .ics ao lead e ao vendedor pelo Office 365', async () => {
  vi.stubEnv('MS_TENANT_ID', 'tenant');
  vi.stubEnv('MS_CLIENT_ID', 'client');
  vi.stubEnv('MS_CLIENT_SECRET', 'secret');
  vi.stubEnv('OFFICE365_SENDER_EMAIL', 'sender@example.com');
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return calls.length === 1
      ? new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 })
      : new Response(null, { status: 202 });
  }));

  await sendCalendarInvite(['lead@example.com', 'seller@example.com'], 'Reunião Prospectra', 'Confirmada para 14h.', 'BEGIN:VCALENDAR\r\nEND:VCALENDAR');

  expect(calls).toHaveLength(2);
  expect(calls[1].url).toContain('/sendMail');
  const payload = JSON.parse(String(calls[1].init.body));
  expect(payload.message.toRecipients.map((r: { emailAddress: { address: string } }) => r.emailAddress.address))
    .toEqual(['lead@example.com', 'seller@example.com']);
  expect(payload.message.attachments[0].name).toBe('convite.ics');
  expect(payload.message.attachments[0].contentType).toBe('text/calendar');
  expect(Buffer.from(payload.message.attachments[0].contentBytes, 'base64').toString('utf8'))
    .toBe('BEGIN:VCALENDAR\r\nEND:VCALENDAR');
});
