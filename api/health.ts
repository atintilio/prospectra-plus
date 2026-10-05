import { json } from './_lib/http';
import type { ApiRequest, ApiResponse } from './_lib/types';

export default function handler(_req: ApiRequest, res: ApiResponse) {
  const storage = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const session = Boolean(process.env.AUTH_SECRET);
  const office365 = Boolean(process.env.OFFICE365_TENANT_ID && process.env.OFFICE365_CLIENT_ID && process.env.OFFICE365_CLIENT_SECRET && process.env.OFFICE365_SENDER_EMAIL);
  return json(res, storage && session && office365 ? 200 : 503, {
    status: storage && session && office365 ? 'ok' : 'not_configured',
    storage: storage ? 'configured' : 'missing',
    session: session ? 'configured' : 'missing',
    office365: office365 ? 'configured' : 'missing',
  });
}
