import { describe, expect, it } from 'vitest';
import { buildCampaignMessage, validateSignatureImage, SIGNATURE_CID } from '@/lib/email-message';
import { testDb, seedOrg } from './helpers';
import * as schema from '@/db/schema';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe('assinatura em imagem', () => {
  it('sem imagem mantém texto puro com a assinatura em texto', () => {
    const m = buildCampaignMessage({ to: 'a@b.com', subject: 'Oi', body: 'Olá\n', signature: 'André' });
    expect(m.body).toEqual({ contentType: 'Text', content: 'Olá\n\nAndré' });
    expect('attachments' in m).toBe(false);
  });
  it('com imagem envia HTML escapado e anexo inline referenciado por cid', () => {
    const m = buildCampaignMessage({ to: 'a@b.com', subject: 'Oi', body: '<b>x</b>\nlinha', signature: 'André', image: { contentType: 'image/png', data: 'QUJD' } });
    expect(m.body.contentType).toBe('HTML');
    expect(m.body.content).toContain('&lt;b&gt;x&lt;/b&gt;<br>linha');
    expect(m.body.content).toContain(`cid:${SIGNATURE_CID}`);
    const att = (m as { attachments: { isInline: boolean; contentId: string; contentBytes: string }[] }).attachments[0];
    expect(att).toMatchObject({ isInline: true, contentId: SIGNATURE_CID, contentBytes: 'QUJD' });
  });
  it('valida pelo conteúdo real do arquivo', () => {
    expect(validateSignatureImage(PNG)).toEqual({ ok: true, contentType: 'image/png' });
    expect(validateSignatureImage(Uint8Array.from([0xff, 0xd8, 0xff, 1]))).toMatchObject({ ok: true, contentType: 'image/jpeg' });
    expect(validateSignatureImage(new TextEncoder().encode('<svg onload=x>'))).toMatchObject({ ok: false });
    expect(validateSignatureImage(new Uint8Array(0))).toMatchObject({ ok: false });
    expect(validateSignatureImage(new Uint8Array(1_000_001).fill(0x89))).toMatchObject({ ok: false });
  });
  it('a tabela existe após as migrações e remove com o usuário', async () => {
    const db = await testDb();
    const { user } = await seedOrg(db);
    await db.insert(schema.userSignatureImages).values({ userId: user.id, contentType: 'image/png', data: 'QUJD' });
    expect(await db.select().from(schema.userSignatureImages)).toHaveLength(1);
  });
});
