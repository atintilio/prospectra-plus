import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { schema, type DB } from '@/db';

/**
 * Voz no AMBIENTE DEMO: nenhuma nuvem, nenhum WhatsApp, nenhuma geração remota.
 * A gravação do usuário fica local no servidor, em diretório dedicado da demo,
 * e só é servida para membros autenticados da mesma organização de demo.
 * Produção nunca passa por aqui: as ações de voz real exigem integração configurada.
 */

const EXT_ID = 'deadbeef01'; // ID externo local da demo (nunca vem do formulário)

export function voiceDemoDir(): string {
  return process.env.VOICE_DEMO_DIR?.trim() || path.join(process.cwd(), '.data', 'voice-demo');
}

function fileFor(orgId: string, userId: string): string {
  return path.join(voiceDemoDir(), `${orgId}-${userId}.wav`);
}

export type VoiceDemoScope = { orgId: string; userId: string };

/** Estado da voz de demo do usuário. */
export async function demoVoiceProfile(db: DB, scope: VoiceDemoScope) {
  const [profile] = await db.select().from(schema.voiceProfiles).where(and(eq(schema.voiceProfiles.orgId, scope.orgId), eq(schema.voiceProfiles.userId, scope.userId)));
  return profile?.enabled && profile.engine === 'demo-local' ? profile : null;
}

/** Valida e grava o áudio de referência local da demo, com transcrição anotada. */
export async function saveDemoVoice(db: DB, scope: VoiceDemoScope, bytes: Uint8Array, transcript: string): Promise<void> {
  if (bytes.byteLength < 200) throw new Error('Gravação muito curta. Grave ou envie um áudio maior.');
  if (bytes.byteLength > 3_000_000) throw new Error('Gravação acima de 3 MB.');
  const head = new TextDecoder().decode(bytes.slice(0, 4));
  const wave = new TextDecoder().decode(bytes.slice(8, 12));
  if (head !== 'RIFF' || wave !== 'WAVE') throw new Error('Formato inválido: envie um áudio WAV.');
  if (!transcript.trim()) throw new Error('Informe o que foi dito na gravação.');
  await fs.mkdir(voiceDemoDir(), { recursive: true });
  await fs.writeFile(fileFor(scope.orgId, scope.userId), bytes);
  await db.insert(schema.voiceProfiles).values({
    orgId: scope.orgId, userId: scope.userId, externalId: EXT_ID, engine: 'demo-local', enabled: true, consentAt: new Date(),
  }).onConflictDoUpdate({
    target: [schema.voiceProfiles.orgId, schema.voiceProfiles.userId],
    set: { externalId: EXT_ID, engine: 'demo-local', enabled: true, consentAt: new Date() },
  });
}

/** Lê o áudio local gravado do usuário (somente demo). */
export async function readDemoVoice(db: DB, scope: VoiceDemoScope): Promise<Uint8Array | null> {
  const profile = await demoVoiceProfile(db, scope);
  if (!profile) return null;
  try {
    return new Uint8Array(await fs.readFile(fileFor(scope.orgId, scope.userId)));
  } catch {
    return null;
  }
}

/** Remove a voz de demo do usuário (perfil e áudio local). */
export async function deleteDemoVoice(db: DB, scope: VoiceDemoScope): Promise<void> {
  await db.delete(schema.voiceProfiles).where(and(eq(schema.voiceProfiles.orgId, scope.orgId), eq(schema.voiceProfiles.userId, scope.userId)));
  await fs.rm(fileFor(scope.orgId, scope.userId), { force: true });
}
