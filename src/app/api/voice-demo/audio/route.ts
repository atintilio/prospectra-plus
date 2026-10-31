import { getDb } from '@/db';
import { requireOrg } from '@/lib/auth';
import { readDemoVoice } from '@/lib/voice/demo';

/**
 * GET /api/voice-demo/audio — áudio LOCAL da voz de demo.
 * Só responde para usuários autenticados da própria organização de demonstração.
 */

export async function GET() {
  try {
    const ctx = await requireOrg();
    if (!ctx.org.isDemo) return new Response('Somente no ambiente de demonstração.', { status: 403 });
    const bytes = await readDemoVoice(await getDb(), { orgId: ctx.org.id, userId: ctx.user.id });
    if (!bytes) return new Response('Cadastre a sua voz na demo primeiro.', { status: 404 });
    return new Response(bytes as unknown as BodyInit, {
      headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'Content-Disposition': 'inline; filename="voice-demo.wav"' },
    });
  } catch {
    return new Response('Sessão expirada.', { status: 401 });
  }
}
