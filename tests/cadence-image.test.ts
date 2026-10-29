import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { enrollLeads, runScheduler } from '@/lib/cadence';
import { seedOrg, testDb } from './helpers';

const day = (n: number) => new Date(Date.UTC(2026, 9, 15 + n, 13));

async function setup(mediaUrl?: string) {
  const db = await testDb();
  const { org, user } = await seedOrg(db);
  // Recurso por operação: o envio de imagem só existe depois de ativado dentro do Prospectra.
  await db.update(schema.orgs).set({ imageEnabled: true }).where(eq(schema.orgs.id, org.id));
  const steps: schema.CampaignStep[] = [
    { id: 'i1', type: 'image', delayDays: 0, condition: 'always', template: 'Veja, {nome}', useAi: false, mediaUrl },
  ];
  const [camp] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'Img', status: 'active', steps }).returning();
  const [lead] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana', phone: '+5511999998888' }).returning();
  await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
  return { db, org, user };
}

describe('passo de imagem/informativo na campanha', () => {
  it('envia a mídia pelo sender injetado, conclui a ação e registra image_sent', async () => {
    const { db, org } = await setup('https://cdn.exemplo.com/informativo.png');
    const sent: { phone: string; caption: string; kind: string; size: number }[] = [];
    const sendMedia = async (_s: { orgId: string; userId: string }, phone: string, file: Blob, caption: string, kind: 'image' | 'document') => {
      sent.push({ phone, caption, kind, size: file.size }); return { providerMessageId: 'm1' };
    };
    // fetch da URL é stubado para devolver uma imagem pequena
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } })) as typeof fetch;
    try {
      expect((await runScheduler(db, { now: day(0), sendMedia })).created).toBe(1);
    } finally { globalThis.fetch = realFetch; }

    expect(sent).toEqual([{ phone: '5511999998888', caption: 'Veja, Ana', kind: 'image', size: 3 }]);
    expect((await db.select().from(schema.actions))[0].status).toBe('done');
    expect((await db.select().from(schema.events)).map((e) => e.type)).toContain('image_sent');
  });

  it('sem URL de mídia, fica assistida na Fila (nada enviado)', async () => {
    const { db } = await setup(undefined);
    let calls = 0;
    await runScheduler(db, { now: day(0), sendMedia: async () => { calls++; return { providerMessageId: 'x' }; } });
    expect(calls).toBe(0);
    expect((await db.select().from(schema.actions))[0].status).toBe('pending');
  });
});
