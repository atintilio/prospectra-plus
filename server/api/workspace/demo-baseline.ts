import { get } from '@vercel/blob';
import { requireActiveSession } from '../_lib/access.js';
import { json, methodNotAllowed } from '../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../_lib/types.js';

const BASELINE_PATH = 'prospectra/workspaces/demo-baseline.json';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const context = await requireActiveSession(req, res);
    if (!context) return;
    if (context.user.workspaceMode !== 'demo') return json(res, 403, { error: 'demo_access_required' });
    const blob = await get(BASELINE_PATH, { access: 'private', useCache: false });
    if (!blob) return json(res, 404, { error: 'demo_baseline_not_found' });
    const parsed = JSON.parse(await new Response(blob.stream).text()) as { state?: unknown };
    if (!parsed.state || typeof parsed.state !== 'object') return json(res, 500, { error: 'demo_baseline_invalid' });
    return json(res, 200, { ok: true, state: parsed.state });
  } catch {
    return json(res, 500, { error: 'demo_baseline_failed' });
  }
}
