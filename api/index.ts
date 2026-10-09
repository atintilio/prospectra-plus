import linkedinConnect from '../server/api/integrations/linkedin/connect.js';
import health from '../server/api/health.js';
import organization from '../server/api/admin/organization.js';
import testEmail from '../server/api/admin/test-email.js';
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
import bridgeDevices from '../server/api/integrations/prospecting/bridge/devices.js';
import bridgeTasks from '../server/api/integrations/prospecting/bridge/tasks.js';
import bridgeJobs from '../server/api/integrations/prospecting/bridge/jobs.js';
import bridgeResults from '../server/api/integrations/prospecting/bridge/results.js';
import bridgeHeartbeat from '../server/api/integrations/prospecting/bridge/heartbeat.js';
import bridgeEvents from '../server/api/integrations/prospecting/bridge/events.js';
import whatsappInstances from '../server/api/integrations/whatsapp/instances.js';
import whatsappConnect from '../server/api/integrations/whatsapp/connect.js';
import whatsappSend from '../server/api/integrations/whatsapp/send.js';
import whatsappWebhook from '../server/api/integrations/whatsapp/webhook.js';
import baileysWebhook from '../server/api/integrations/whatsapp/baileys-webhook.js';
import type { ApiRequest, ApiResponse } from '../server/api/_lib/types.js';

type Handler = (req: ApiRequest, res: ApiResponse) => unknown | Promise<unknown>;
const routes: Record<string, Handler> = {
  'health': health,
  'integrations/linkedin/connect': linkedinConnect,
  'admin/organization': organization,
  'admin/test-email': testEmail,
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
  'integrations/prospecting/bridge/devices': bridgeDevices,
  'integrations/prospecting/bridge/tasks': bridgeTasks,
  'integrations/prospecting/bridge/jobs': bridgeJobs,
  'integrations/prospecting/bridge/results': bridgeResults,
  'integrations/prospecting/bridge/heartbeat': bridgeHeartbeat,
  'integrations/prospecting/bridge/events': bridgeEvents,
  'integrations/whatsapp/instances': whatsappInstances,
  'integrations/whatsapp/connect': whatsappConnect,
  'integrations/whatsapp/send': whatsappSend,
  'integrations/whatsapp/webhook': whatsappWebhook,
  'integrations/whatsapp/baileys-webhook': baileysWebhook,
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const pathname = (req.url ?? '').split('?')[0].replace(/^\/+|\/+$/g, '');
  const route = pathname.replace(/^api\/?/, '');
  const target = routes[route];
  if (!target) return res.status(404).json({ error: 'not_found' });
  return target(req, res);
}
