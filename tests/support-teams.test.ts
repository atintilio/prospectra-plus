import { describe, expect, it } from 'vitest';
import { schema } from '@/db';
import { assignConversationTeam, createTeam, listInbox, listTeams, setTeamMembers } from '@/lib/support';
import { seedOrg, testDb } from './helpers';

async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db); // user = owner
  const [agent] = await db.insert(schema.users).values({ email: 'agente@x.com', name: 'Agente', status: 'active' }).returning();
  await db.insert(schema.memberships).values({ orgId: org.id, userId: agent.id, role: 'sdr' });
  const [conv] = await db.insert(schema.supportConversations).values({ orgId: org.id, subject: 'Ajuda' }).returning();
  const owner = { orgId: org.id, userId: user.id, role: 'owner' as const };
  const sdr = { orgId: org.id, userId: agent.id, role: 'sdr' as const };
  return { db, org, owner, sdr, agent, conv };
}

describe('times de atendimento', () => {
  it('cria time, define membros e roteia a conversa; o agente passa a ver a conversa do time', async () => {
    const { db, owner, sdr, agent, conv } = await setup();

    // sem time, o agente não vê a conversa (não é dele)
    expect(await listInbox(db, sdr, 'open')).toHaveLength(0);

    const teamId = await createTeam(db, owner, 'Financeiro');
    await setTeamMembers(db, owner, teamId, [agent.id]);
    await assignConversationTeam(db, owner, conv.id, teamId);

    // agora o agente vê, porque é do time; e o filtro por time funciona
    expect((await listInbox(db, sdr, 'open')).map((c) => c.id)).toEqual([conv.id]);
    expect((await listInbox(db, owner, 'open', undefined, teamId)).map((c) => c.id)).toEqual([conv.id]);
    expect(await listTeams(db, owner)).toEqual([{ id: teamId, name: 'Financeiro', memberIds: [agent.id] }]);
  });

  it('agente não cria time, e nome duplicado é rejeitado', async () => {
    const { db, owner, sdr } = await setup();
    await expect(createTeam(db, sdr, 'X')).rejects.toThrow();
    await createTeam(db, owner, 'Dup');
    await expect(createTeam(db, owner, 'Dup')).rejects.toThrow();
  });
});
