import { createHash } from 'node:crypto';
import { emptyWorkspace } from '../../../src/emptyWorkspace.js';
import { get, put } from '@vercel/blob';
import { validateExtension } from '../../../src/crm/merge.js';
import { seedState } from '../../../src/data.js';
import type { Opportunity, ProspectraState } from '../../../src/types.js';
import type { AuthStore, AuthUser } from './types.js';

const WORKSPACE_PATH = 'prospectra/workspace-state.json';

type WorkspaceEnvelope = { version: 1; updatedAt: string; state: ProspectraState };

function requireStorage() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('WORKSPACE_STORAGE_NOT_CONFIGURED');
}

export function workspacePath(user?: AuthUser): string {
  if (!user?.workspaceMode) return WORKSPACE_PATH; // Existing users keep their original data.
  if (!user.id || !['production', 'demo'].includes(user.workspaceMode)) throw new Error('WORKSPACE_SCOPE_INVALID');
  return `prospectra/workspaces/${user.workspaceMode}-${createHash('sha256').update(user.id).digest('hex')}.json`;
}
export function initialWorkspace(user?: AuthUser): ProspectraState {
  return user?.workspaceMode === 'demo' ? structuredClone(seedState) : emptyWorkspace();
}

function isState(value: unknown): value is ProspectraState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProspectraState>;
  return Array.isArray(candidate.accounts) && Array.isArray(candidate.campaigns) && Array.isArray(candidate.channels) && Array.isArray(candidate.opportunities) && Array.isArray(candidate.diagnoses);
}

export async function loadWorkspaceState(user?: AuthUser): Promise<WorkspaceEnvelope> {
  requireStorage();
  const blob = await get(workspacePath(user), { access: 'private', useCache: false });
  if (!blob) return { version: 1, updatedAt: new Date().toISOString(), state: initialWorkspace(user) };
  const text = await new Response(blob.stream).text();
  try {
    const parsed = JSON.parse(text) as Partial<WorkspaceEnvelope>;
    if (!isState(parsed.state)) throw new Error('WORKSPACE_STORAGE_INVALID');
    return { version: 1, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(), state: parsed.state };
  } catch {
    throw new Error('WORKSPACE_STORAGE_INVALID');
  }
}

export async function saveWorkspaceState(state: ProspectraState, user?: AuthUser): Promise<WorkspaceEnvelope> {
  requireStorage();
  const envelope: WorkspaceEnvelope = { version: 1, updatedAt: new Date().toISOString(), state };
  await put(workspacePath(user), JSON.stringify(envelope), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 0 });
  return envelope;
}

export function synchronizeOrganization(state: ProspectraState, store: AuthStore, user?: AuthUser): ProspectraState {
  if (user?.workspaceMode) return state;
  const members = store.users.filter((user) => user.active && !user.workspaceMode).map((user) => ({ id: user.id, name: user.name ?? user.email, email: user.email, role: user.role === 'admin' ? 'Administrador' as const : user.role === 'leader' ? 'Líder' as const : 'Liderado' as const, teamId: user.teamId }));
  const teams = store.teams.map((team) => ({ id: team.id, name: team.name, leaderId: team.leaderId, memberIds: team.memberIds, color: team.color }));
  return { ...state, members, teams };
}

function allowedOpportunities(state: ProspectraState, user: AuthUser): Opportunity[] {
  if (user.role === 'admin') return state.opportunities;
  if (user.role === 'leader') return state.opportunities.filter((opportunity) => opportunity.teamId === user.teamId);
  return state.opportunities.filter((opportunity) => opportunity.ownerId === user.id);
}

export function visibleWorkspaceState(state: ProspectraState, user: AuthUser): ProspectraState {
  if (user.workspaceMode || user.role === 'admin') return state;
  const opportunities = allowedOpportunities(state, user);
  const opportunityIds = new Set(opportunities.map((opportunity) => opportunity.id));
  const accountIds = new Set(opportunities.map((opportunity) => opportunity.accountId));
  const accounts = state.accounts.filter((account) => accountIds.has(account.id));
  const teams = user.role === 'leader' ? state.teams.filter((team) => team.id === user.teamId) : state.teams.filter((team) => team.memberIds.includes(user.id));
  const teamMemberIds = new Set(teams.flatMap((team) => team.memberIds));
  const campaigns = state.campaigns.map((campaign) => ({ ...campaign, accounts: campaign.accounts.filter((id) => accountIds.has(id)), tasks: campaign.tasks.filter((task) => accountIds.has(task.accountId)) })).filter((campaign) => campaign.accounts.length || campaign.tasks.length);
  return {
    ...state,
    crmExtension: state.crmExtension ? { ...state.crmExtension,
      values: Object.fromEntries(Object.entries(state.crmExtension.values).filter(([id]) => accountIds.has(id) || accounts.some(a => a.contacts.some(c => c.id === id)) || opportunityIds.has(id))),
      proposals: state.crmExtension.proposals.filter(p => accounts.some(a => a.contacts.some(c => c.id === p.contactId))),
      events: state.crmExtension.events.filter(e => accountIds.has(e.accountId)),
    } : undefined,
    accounts,
    opportunities,
    diagnoses: state.diagnoses.filter((diagnosis) => opportunityIds.has(diagnosis.opportunityId)),
    campaigns,
    teams,
    members: state.members.filter((member) => teamMemberIds.has(member.id) || member.id === user.id),
    signals: state.signals.filter((signal) => accountIds.has(signal.accountId)),
    selectedAccountId: accounts[0]?.id ?? '',
    selectedCampaignId: campaigns[0]?.id ?? '',
  };
}

export function mergeSafeWorkspaceState(current: ProspectraState, candidate: unknown): ProspectraState {
  if (!isState(candidate)) throw new Error('WORKSPACE_STATE_INVALID');
  const safe = candidate as ProspectraState;
  validateExtension(safe);
  return {
    ...current,
    selectedAccountId: safe.selectedAccountId,
    selectedCampaignId: safe.selectedCampaignId,
    accounts: safe.accounts,
    crmExtension: safe.crmExtension ?? current.crmExtension,
    campaigns: safe.campaigns,
    channels: current.channels,
    agent: safe.agent,
    playbook: safe.playbook,
    signals: safe.signals,
    teams: current.teams,
    members: current.members,
    opportunities: current.opportunities,
    diagnoses: current.diagnoses,
  };
}

export type { WorkspaceEnvelope };
