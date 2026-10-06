import { randomUUID } from 'node:crypto';
import { requireOwner, requireSameOrigin } from '../_lib/access.js';
import { saveAuthStore } from '../_lib/db.js';
import { digestToken, randomToken } from '../_lib/crypto.js';
import { json, methodNotAllowed, parseBody, publicOrigin } from '../_lib/http.js';
import { sendPasswordSetupEmail } from '../_lib/mailer.js';
import type { ApiRequest, ApiResponse, AuthStore, StoredTeam, StoredUser, TeamColor, UserRole } from '../_lib/types.js';

const MASTER_EMAIL = (process.env.MASTER_USER_EMAIL ?? 'atintilio@argusprime.com.br').trim().toLowerCase();
const roles: UserRole[] = ['admin', 'leader', 'member'];
const colors: TeamColor[] = ['purple', 'emerald', 'lilac'];

function timestamp() { return new Date().toISOString(); }
function isRole(value: unknown): value is UserRole { return typeof value === 'string' && roles.includes(value as UserRole); }
function isColor(value: unknown): value is TeamColor { return typeof value === 'string' && colors.includes(value as TeamColor); }
function cleanText(value: unknown, max = 96) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''; }
function cleanEmail(value: unknown) { return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : ''; }
function emailIsValid(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

function publicUser(user: StoredUser) {
  return {
    id: user.id,
    name: user.name ?? user.email,
    email: user.email,
    role: user.role,
    teamId: user.teamId ?? null,
    active: user.active,
    passwordSet: Boolean(user.passwordHash),
    invitationState: !user.active ? 'inactive' : user.passwordHash ? 'active' : 'pending',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function organization(store: AuthStore) {
  return {
    users: [...store.users].map(publicUser).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    teams: [...store.teams].map((team) => ({ id: team.id, name: team.name, leaderId: team.leaderId, memberIds: team.memberIds, color: team.color })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  };
}

function teamById(store: AuthStore, teamId: unknown): StoredTeam | undefined {
  return typeof teamId === 'string' ? store.teams.find((team) => team.id === teamId) : undefined;
}

function activeUser(store: AuthStore, userId: unknown): StoredUser | undefined {
  return typeof userId === 'string' ? store.users.find((user) => user.id === userId && user.active) : undefined;
}

function removeFromTeams(store: AuthStore, userId: string, exceptTeamId?: string) {
  for (const team of store.teams) {
    if (team.id === exceptTeamId || !team.memberIds.includes(userId)) continue;
    if (team.leaderId === userId) throw new Error('team_leader_must_be_reassigned');
    team.memberIds = team.memberIds.filter((id) => id !== userId);
    team.updatedAt = timestamp();
  }
}

function setTeamMembership(store: AuthStore, team: StoredTeam, memberIds: string[]) {
  const uniqueIds = [...new Set(memberIds)];
  const previousIds = new Set(team.memberIds);
  for (const userId of uniqueIds) {
    const user = activeUser(store, userId);
    if (!user || user.role === 'admin') throw new Error('invalid_team_member');
    removeFromTeams(store, userId, team.id);
    user.teamId = team.id;
    user.updatedAt = timestamp();
  }
  for (const previousId of previousIds) {
    if (uniqueIds.includes(previousId)) continue;
    const user = store.users.find((entry) => entry.id === previousId);
    if (user?.teamId === team.id) {
      user.teamId = undefined;
      user.updatedAt = timestamp();
    }
  }
  team.memberIds = uniqueIds;
  team.updatedAt = timestamp();
}

async function issueInvite(req: ApiRequest, store: AuthStore, user: StoredUser) {
  const rawToken = randomToken();
  const now = timestamp();
  store.resets = store.resets.filter((reset) => reset.userId !== user.id && new Date(reset.expiresAt).getTime() > Date.now());
  store.resets.push({ id: randomUUID(), userId: user.id, tokenHash: digestToken(rawToken), expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), createdAt: now });
  await saveAuthStore(store);
  try {
    await sendPasswordSetupEmail(user.email, `${publicOrigin(req)}/definir-senha?token=${encodeURIComponent(rawToken)}`, { recipientName: user.name, invitation: !user.passwordHash });
  } catch (error) {
    store.resets = store.resets.filter((reset) => reset.tokenHash !== digestToken(rawToken));
    await saveAuthStore(store);
    throw error;
  }
  return user.email;
}

function responseForError(res: ApiResponse, error: unknown) {
  const code = error instanceof Error ? error.message : 'organization_update_failed';
  const safe = ['team_leader_must_be_reassigned', 'invalid_team_member', 'leader_must_have_leader_role', 'master_user_protected', 'user_already_exists', 'leader_already_assigned', 'team_not_found', 'user_not_found', 'invalid_user_input', 'invalid_team_input', 'admin_cannot_join_team', 'create_team_leader_through_team_editor'].includes(code) ? code : 'organization_update_failed';
  return json(res, safe === 'organization_update_failed' ? 500 : 409, { error: safe });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method ?? '')) return methodNotAllowed(res, ['GET', 'POST', 'PATCH']);
  try {
    const context = await requireOwner(req, res);
    if (!context) return;
    if (req.method === 'GET') return json(res, 200, { ok: true, organization: organization(context.store) });
    if (!requireSameOrigin(req, res)) return;

    const body = parseBody(req);
    if (req.method === 'POST' && body.action === 'create-user') {
      const name = cleanText(body.name);
      const email = cleanEmail(body.email);
      const role = isRole(body.role) ? body.role : null;
      const teamId = typeof body.teamId === 'string' && body.teamId ? body.teamId : undefined;
      if (!name || !emailIsValid(email) || !role) return json(res, 400, { error: 'invalid_user_input' });
      if (context.store.users.some((user) => user.email === email)) return json(res, 409, { error: 'user_already_exists' });
      if (teamId && role === 'admin') return json(res, 400, { error: 'admin_cannot_join_team' });
      const team = teamId ? teamById(context.store, teamId) : undefined;
      if (teamId && !team) return json(res, 404, { error: 'team_not_found' });
      const now = timestamp();
      const user: StoredUser = { id: randomUUID(), name, email, role, teamId, passwordHash: null, active: true, createdAt: now, updatedAt: now };
      context.store.users.push(user);
      if (team) {
        if (role !== 'member') return json(res, 400, { error: 'create_team_leader_through_team_editor' });
        setTeamMembership(context.store, team, [...team.memberIds, user.id]);
      }
      await saveAuthStore(context.store);
      const inviteSentTo = body.sendInvite === true ? await issueInvite(req, context.store, user) : undefined;
      return json(res, 201, { ok: true, organization: organization(context.store), ...(inviteSentTo ? { inviteSentTo } : {}) });
    }

    if (req.method === 'POST' && body.action === 'create-team') {
      const name = cleanText(body.name);
      const leader = activeUser(context.store, body.leaderId);
      const color = isColor(body.color) ? body.color : 'purple';
      if (!name || !leader) return json(res, 400, { error: 'invalid_team_input' });
      if (leader.role !== 'leader') return json(res, 409, { error: 'leader_must_have_leader_role' });
      if (leader.teamId) return json(res, 409, { error: 'leader_already_assigned' });
      const now = timestamp();
      const team: StoredTeam = { id: `team_${randomUUID()}`, name, leaderId: leader.id, memberIds: [leader.id], color, createdAt: now, updatedAt: now };
      context.store.teams.push(team);
      leader.teamId = team.id;
      leader.updatedAt = now;
      await saveAuthStore(context.store);
      return json(res, 201, { ok: true, organization: organization(context.store) });
    }

    if (req.method === 'PATCH' && body.action === 'update-user') {
      const user = context.store.users.find((entry) => entry.id === body.userId);
      if (!user) return json(res, 404, { error: 'user_not_found' });
      const nextRole = isRole(body.role) ? body.role : user.role;
      const nextActive = typeof body.active === 'boolean' ? body.active : user.active;
      const nextName = cleanText(body.name) || user.name || user.email;
      const nextEmail = body.email === undefined ? user.email : cleanEmail(body.email);
      const hasTeamUpdate = Object.prototype.hasOwnProperty.call(body, 'teamId');
      const requestedTeamId = body.teamId === null || body.teamId === '' ? undefined : typeof body.teamId === 'string' ? body.teamId : user.teamId;
      const isMaster = user.email === MASTER_EMAIL;
      if (!emailIsValid(nextEmail) || !nextName) return json(res, 400, { error: 'invalid_user_input' });
      if (context.store.users.some((entry) => entry.id !== user.id && entry.email === nextEmail)) return json(res, 409, { error: 'user_already_exists' });
      if (isMaster && (nextEmail !== user.email || nextRole !== user.role || !nextActive)) return json(res, 409, { error: 'master_user_protected' });
      if (nextRole === 'admin' && requestedTeamId) return json(res, 400, { error: 'admin_cannot_join_team' });
      const requestedTeam = requestedTeamId ? teamById(context.store, requestedTeamId) : undefined;
      if (requestedTeamId && !requestedTeam) return json(res, 404, { error: 'team_not_found' });
      const leaderTeam = context.store.teams.find((team) => team.leaderId === user.id);
      if (leaderTeam && (nextRole !== 'leader' || !nextActive || (hasTeamUpdate && requestedTeamId !== leaderTeam.id))) return json(res, 409, { error: 'team_leader_must_be_reassigned' });
      if (nextRole === 'leader' && hasTeamUpdate && requestedTeamId && requestedTeamId !== user.teamId) return json(res, 409, { error: 'create_team_leader_through_team_editor' });
      if (nextRole === 'admin' || !nextActive || (hasTeamUpdate && nextRole === 'member')) removeFromTeams(context.store, user.id);
      if (nextRole === 'member' && nextActive && hasTeamUpdate && requestedTeam) setTeamMembership(context.store, requestedTeam, [...requestedTeam.memberIds, user.id]);
      user.name = nextName;
      if (nextEmail !== user.email) {
        user.email = nextEmail;
        user.passwordHash = null;
        context.store.resets = context.store.resets.filter((reset) => reset.userId !== user.id);
      }
      user.role = nextRole;
      user.active = nextActive;
      if (nextRole === 'admin' || !nextActive || (hasTeamUpdate && nextRole === 'member' && !requestedTeam)) user.teamId = undefined;
      user.updatedAt = timestamp();
      await saveAuthStore(context.store);
      return json(res, 200, { ok: true, organization: organization(context.store) });
    }

    if (req.method === 'PATCH' && body.action === 'send-invite') {
      const user = context.store.users.find((entry) => entry.id === body.userId);
      if (!user) return json(res, 404, { error: 'user_not_found' });
      if (!user.active) return json(res, 409, { error: 'inactive_user' });
      const inviteSentTo = await issueInvite(req, context.store, user);
      return json(res, 200, { ok: true, organization: organization(context.store), inviteSentTo });
    }

    if (req.method === 'PATCH' && body.action === 'update-team') {
      const team = teamById(context.store, body.teamId);
      if (!team) return json(res, 404, { error: 'team_not_found' });
      const leader = activeUser(context.store, body.leaderId);
      const name = cleanText(body.name) || team.name;
      const color = isColor(body.color) ? body.color : team.color;
      const requestedIds = Array.isArray(body.memberIds) ? body.memberIds.filter((id): id is string => typeof id === 'string') : team.memberIds;
      if (!leader || leader.role !== 'leader') return json(res, 409, { error: 'leader_must_have_leader_role' });
      const memberIds = [...new Set([leader.id, ...requestedIds])];
      for (const userId of memberIds) {
        const member = activeUser(context.store, userId);
        if (!member || member.role === 'admin') return json(res, 400, { error: 'invalid_team_member' });
        const otherTeam = context.store.teams.find((entry) => entry.id !== team.id && entry.leaderId === userId);
        if (otherTeam) return json(res, 409, { error: 'leader_already_assigned' });
      }
      team.name = name;
      team.color = color;
      team.leaderId = leader.id;
      setTeamMembership(context.store, team, memberIds);
      await saveAuthStore(context.store);
      return json(res, 200, { ok: true, organization: organization(context.store) });
    }

    return json(res, 400, { error: 'unsupported_action' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('OFFICE365_')) {
      console.error('prospectra_owner_invite_error', message);
      return json(res, message.includes('NOT_CONFIGURED') ? 503 : 502, { error: 'invite_delivery_failed' });
    }
    return responseForError(res, error);
  }
}
