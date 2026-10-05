import { ensureAuthSchema } from './_lib/db';
import { json } from './_lib/http';
import type { ApiRequest, ApiResponse } from './_lib/types';

export default async function handler(_req: ApiRequest, res: ApiResponse) {
  const checks = {
    database: Boolean(process.env.DATABASE_URL),
    authSecret: Boolean(process.env.AUTH_SECRET),
    email: Boolean(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM),
    scrapegraph: Boolean(process.env.SGAI_API_KEY),
    crm: Boolean(process.env.CRM_BASE_URL && process.env.CRM_API_KEY),
  };
  try {
    if (checks.database) await ensureAuthSchema();
    return json(res, checks.database && checks.authSecret ? 200 : 503, { ok: checks.database && checks.authSecret, checks });
  } catch { return json(res, 503, { ok: false, checks, error: 'health_check_failed' }); }
}
