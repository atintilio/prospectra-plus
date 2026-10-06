import health from '../server/api/health.js';
import organization from '../server/api/admin/organization.js';
import login from '../server/api/auth/login.js';
import logout from '../server/api/auth/logout.js';
import me from '../server/api/auth/me.js';
import requestPassword from '../server/api/auth/request-password.js';
import setPassword from '../server/api/auth/set-password.js';
import channelsHealth from '../server/api/integrations/channels/health.js';
import prospectingAccounts from '../server/api/integrations/prospecting/accounts.js';
import hostedAuth from '../server/api/integrations/prospecting/hosted-auth.js';
import unipileWebhook from '../server/api/integrations/prospecting/unipile-webhook.js';
import scrapegraphEnrich from '../server/api/integrations/scrapegraph/enrich.js';
import scrapegraphHealth from '../server/api/integrations/scrapegraph/health.js';
import workspaceState from '../server/api/workspace/state.js';
import type { ApiRequest, ApiResponse } from '../server/api/_lib/types.js';

type Handler = (req: ApiRequest, res: ApiResponse) => unknown | Promise<unknown>;
const routes: Record<string, Handler> = {
  'health': health,
  'admin/organization': organization,
  'auth/login': login,
  'auth/logout': logout,
  'auth/me': me,
  'auth/request-password': requestPassword,
  'auth/set-password': setPassword,
  'integrations/channels/health': channelsHealth,
  'integrations/prospecting/accounts': prospectingAccounts,
  'integrations/prospecting/hosted-auth': hostedAuth,
  'integrations/prospecting/unipile-webhook': unipileWebhook,
  'integrations/scrapegraph/enrich': scrapegraphEnrich,
  'integrations/scrapegraph/health': scrapegraphHealth,
  'workspace/state': workspaceState,
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const pathname = (req.url ?? '').split('?')[0].replace(/^\/+|\/+$/g, '');
  const route = pathname.replace(/^api\/?/, '');
  const target = routes[route];
  if (!target) return res.status(404).json({ error: 'not_found' });
  return target(req, res);
}
