// Monta a mensagem de campanha para o Microsoft Graph. Função pura (sem rede/banco) para ser testável.
// Sem imagem de assinatura: texto puro, exatamente como antes. Com imagem: HTML + anexo inline (cid).

export const SIGNATURE_MAX_BYTES = 1_000_000;
export const SIGNATURE_CID = 'assinatura-vendedor';

export type SignatureImage = { contentType: string; data: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Valida pelo conteúdo real (assinatura binária), não pela extensão enviada. */
export function validateSignatureImage(bytes: Uint8Array): { ok: true; contentType: string } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: 'Arquivo vazio.' };
  if (bytes.length > SIGNATURE_MAX_BYTES) return { ok: false, error: 'Imagem acima de 1 MB. Reduza o tamanho e tente de novo.' };
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ok: true, contentType: 'image/png' };
  if (starts([0xff, 0xd8, 0xff])) return { ok: true, contentType: 'image/jpeg' };
  if (starts([0x47, 0x49, 0x46, 0x38])) return { ok: true, contentType: 'image/gif' };
  return { ok: false, error: 'Formato inválido. Envie PNG, JPG ou GIF.' };
}

export function buildCampaignMessage(opts: { to: string; subject: string; body: string; signature?: string; image?: SignatureImage | null }) {
  const subject = opts.subject.slice(0, 200);
  const signature = opts.signature?.trim() ?? '';
  const toRecipients = [{ emailAddress: { address: opts.to } }];
  if (!opts.image) {
    const content = signature ? `${opts.body.trimEnd()}\n\n${signature}` : opts.body;
    return { subject, body: { contentType: 'Text', content }, toRecipients };
  }
  const text = esc(opts.body.trimEnd()).replace(/\r?\n/g, '<br>');
  const sigText = signature ? `<br><br>${esc(signature).replace(/\r?\n/g, '<br>')}` : '';
  const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${text}${sigText}<br><br><img src="cid:${SIGNATURE_CID}" alt="Assinatura" style="max-width:600px;height:auto"></div>`;
  return {
    subject,
    body: { contentType: 'HTML', content: html },
    toRecipients,
    attachments: [{
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: `assinatura.${opts.image.contentType === 'image/png' ? 'png' : opts.image.contentType === 'image/gif' ? 'gif' : 'jpg'}`,
      contentType: opts.image.contentType,
      contentBytes: opts.image.data,
      isInline: true,
      contentId: SIGNATURE_CID,
    }],
  };
}
