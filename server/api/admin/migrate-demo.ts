import { randomUUID } from 'node:crypto';
import { BlobPreconditionFailedError, get, put } from '@vercel/blob';
import { requireOwner, requireSameOrigin } from '../_lib/access.js';
import { json, methodNotAllowed } from '../_lib/http.js';
import { loadWorkspaceState, saveWorkspaceState } from '../_lib/workspace.js';
import { emptyWorkspace } from '../../../src/emptyWorkspace.js';
import type { ApiRequest, ApiResponse } from '../_lib/types.js';

const BASELINE_PATH = 'prospectra/workspaces/demo-baseline.json';

function counts(state: Awaited<ReturnType<typeof loadWorkspaceState>>['state']) {
  return {
    accounts: state.accounts.length,
    contacts: state.accounts.reduce((sum, account) => sum + account.contacts.length, 0),
    campaigns: state.campaigns.length,
    signals: state.signals.length,
    opportunities: state.opportunities.length,
    diagnoses: state.diagnoses.length,
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  try {
    const context = await requireOwner(req, res);
    if (!context) return;
    const legacy = await loadWorkspaceState(context.user);
    const demoUser = { ...context.user, workspaceMode: 'demo' as const };
    const demo = await loadWorkspaceState(demoUser);
    const baseline = await get(BASELINE_PATH, { access: 'private', useCache: false });
    const baselineData = baseline ? JSON.parse(await new Response(baseline.stream).text()) as { state?: unknown; sourceEtag?: string; backupPath?: string } : null;
    const sourceMatches = Boolean(baselineData?.sourceEtag === legacy.etag);
    const demoMatches = Boolean(demo.etag && JSON.stringify(baselineData?.state) === JSON.stringify(demo.state));
    const resumable = sourceMatches && (!demo.etag || demoMatches);
    if (req.method === 'GET') return json(res, 200, {
      ok: true, source: counts(legacy.state), demo: counts(demo.state),
      sourcePersisted: Boolean(legacy.etag), demoPersisted: Boolean(demo.etag),
      migrated: Boolean(baseline && demo.etag && !legacy.state.accounts.length), resumable,
    });
    if (!requireSameOrigin(req, res)) return;
    if (!legacy.etag || !legacy.state.accounts.length) return json(res, 409, { error: 'migration_precondition_failed' });
    if (baseline || demo.etag) {
      if (!baseline || !resumable || !baselineData?.state) return json(res, 409, { error: 'migration_precondition_failed' });
      if (!demo.etag) await saveWorkspaceState(baselineData.state as typeof legacy.state, demoUser, null);
      const verified = await loadWorkspaceState(demoUser);
      if (JSON.stringify(baselineData.state) !== JSON.stringify(verified.state)) return json(res, 500, { error: 'demo_verification_failed' });
      await saveWorkspaceState(emptyWorkspace(), context.user, legacy.etag);
      return json(res, 200, { ok: true, migrated: true, counts: counts(verified.state), backupPath: baselineData?.backupPath });
    }

    const migrated = structuredClone(legacy.state);
    // Demo participants share sample business data, never the production user directory.
    migrated.members = [];
    migrated.teams = [];
    const now = new Date().toISOString();
    const backupPath = `prospectra/backups/legacy-${now.replace(/[:.]/g, '-')}-${randomUUID()}.json`;
    const original = { version: 1, updatedAt: legacy.updatedAt, state: legacy.state };
    const envelope = { version: 1, updatedAt: now, sourceEtag: legacy.etag, backupPath, state: migrated };
    const options = { access: 'private' as const, addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json', cacheControlMaxAge: 0 };
    await put(backupPath, JSON.stringify(original), options);
    await put(BASELINE_PATH, JSON.stringify(envelope), options);
    await saveWorkspaceState(migrated, demoUser, null);
    const verified = await loadWorkspaceState(demoUser);
    if (!verified.etag || JSON.stringify(verified.state) !== JSON.stringify(migrated)) {
      return json(res, 500, { error: 'demo_verification_failed', backupPath });
    }
    await saveWorkspaceState(emptyWorkspace(), context.user, legacy.etag);
    return json(res, 200, { ok: true, migrated: true, counts: counts(migrated), backupPath });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) return json(res, 409, { error: 'migration_conflict' });
    const code = error instanceof Error ? error.message : 'migration_failed';
    if (code.includes('NOT_CONFIGURED')) return json(res, 503, { error: 'storage_not_configured' });
    return json(res, 500, { error: 'migration_failed' });
  }
}
