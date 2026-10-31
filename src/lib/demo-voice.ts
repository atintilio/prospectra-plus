import { and, eq } from 'drizzle-orm';
import { schema, type DB } from '@/db';

/**
 * Seed da demonstração — voz do vendedor.
 *
 * A voz do Prospectra é a tela "Minha voz": o perfil clonado (com a
 * autorização do vendedor), a fila de mensagens de áudio e o registro de
 * consentimento.
 *
 * Regras do módulo:
 *  - nada de rede: nenhum áudio é gerado, nenhuma mensagem é enviada (a
 *    operação de demonstração já bloqueia o envio automático);
 *  - dado fictício: telefones no padrão `+55 51 9XXXX-XXXX` — nunca um número
 *    real;
 *  - idempotente: rodar duas vezes não duplica perfil, fila nem registro;
 *  - determinístico: ids derivados de hash do próprio dado (nunca
 *    `Math.random`, nunca `crypto.randomUUID`).
 */

/** Fuso da demonstração (a voz segue o fuso da operação). */
const TIMEZONE = 'America/Sao_Paulo';

/** Identificador externo fictício do perfil (formato do provedor de voz). */
const EXTERNAL_ID = 'de3a0001';

/** Motor de voz exibido na tela. */
const ENGINE = 'moss-tts-nano';

/** Lead enxuto: o seed só precisa these campos do CRM. */
export type DemoVoiceLead = {
  id: string;
  fullName: string;
  company: string;
  headline: string;
  stage: string;
  ownerId: string | null;
};

/** Contexto compartilhado do seed da demonstração. */
export type VoiceDemoCtx = {
  orgId: string;
  userId: string;
  userIds: string[];
  leads: DemoVoiceLead[];
  now: Date;
  rand: () => number;
};

/** Resumo do que o seed gravou. */
export type VoiceSeedResult = {
  profile: { externalId: string; engine: string; enabled: boolean; created: boolean };
  jobs: Array<{ id: string; state: string; kind: 'audio' | 'call'; recipient: string; created: boolean }>;
  registration: { id: string; created: boolean };
};

// ------------------------------------------------------------------ helpers

/** Hash estável (dois canais) em hexadecimal — o mesmo texto gera sempre o mesmo hash. */
function hashHex(seed: string, bytes: number): string {
  const text = seed || 'demo';
  let h1 = 0x811c9dc5 ^ text.length;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  const out: string[] = [];
  for (let i = 0; out.length < bytes; i += 1) {
    const mixed = Math.imul(h1 ^ Math.imul(h2 + i, 0x27d4eb2d), 0x165667b1) >>> 0;
    out.push((mixed & 0xff).toString(16).padStart(2, '0'));
  }
  return out.join('');
}

/** UUID no formato v4 derivado do texto (determinístico, sem `Math.random`). */
function deterministicUuid(seed: string): string {
  const bytes = hashHex(seed, 16)
    .match(/../g)
    ?.map((pair) => parseInt(pair, 16)) ?? [];
  if (bytes.length !== 16) throw new Error('Demo: hash inválido para o id determinístico.');
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Telefone fictício no padrão `+55 51 9XXXX-XXXX` (derivado do id, estável). */
function fakePhone(seed: string): string {
  const digits = hashHex(seed, 4)
    .split('')
    .map((char) => String(parseInt(char, 16) % 10))
    .join('');
  return `+55519${digits}`;
}

/** Primeiro lead com uma das etapas pedidas; senão, o primeiro da lista. */
function pickLead(ctx: VoiceDemoCtx, stages: string[], used: Set<string>): DemoVoiceLead | null {
  for (const stage of stages) {
    const found = ctx.leads.find((lead) => lead.stage === stage && !used.has(lead.id));
    if (found) return found;
  }
  const fallback = ctx.leads.find((lead) => !used.has(lead.id));
  return fallback ?? null;
}

// -------------------------------------------------------------------- seed

/**
 * Semeia a voz da demonstração: um perfil de voz clonado (com consentimento
 * registrado), dois jobs de áudio na fila (um enviado, um na fila) e o
 * registro de cadastro de voz do vendedor.
 *
 * Idempotente: pode rodar em uma org já povoada sem duplicar nada.
 */
export async function seedVoice(db: DB, ctx: VoiceDemoCtx): Promise<VoiceSeedResult> {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const orgId = ctx.orgId;
  const userId = ctx.userId;

  // 1) Perfil de voz do dono da demonstração (1 perfil por operação+vendedor).
  const consentAt = new Date(now.getTime() - 12 * 86_400_000);
  const [profileExistente] = await db
    .select({ externalId: schema.voiceProfiles.externalId })
    .from(schema.voiceProfiles)
    .where(and(eq(schema.voiceProfiles.orgId, orgId), eq(schema.voiceProfiles.userId, userId)))
    .limit(1);

  let profileCriado = false;
  if (!profileExistente) {
    const [created] = await db
      .insert(schema.voiceProfiles)
      .values({
        orgId,
        userId,
        externalId: EXTERNAL_ID,
        engine: ENGINE,
        enabled: true,
        consentAt,
      })
      .onConflictDoNothing()
      .returning();
    profileCriado = Boolean(created);
  }

  const [perfil] = await db
    .select({ externalId: schema.voiceProfiles.externalId, engine: schema.voiceProfiles.engine, enabled: schema.voiceProfiles.enabled })
    .from(schema.voiceProfiles)
    .where(and(eq(schema.voiceProfiles.orgId, orgId), eq(schema.voiceProfiles.userId, userId)))
    .limit(1);
  if (!perfil) throw new Error('Demo: não foi possível criar o perfil de voz.');

  // 2) Fila de áudio: um job já enviado e um job na fila.
  const used = new Set<string>();
  const leadEnviado = pickLead(ctx, ['meeting', 'replied', 'connected'], used);
  if (leadEnviado) used.add(leadEnviado.id);
  const leadNaFila = pickLead(ctx, ['replied', 'connected', 'invited'], used);

  const plano: Array<{
    lead: DemoVoiceLead | null;
    state: 'sent' | 'queued';
    text: string;
    startedAt: Date | null;
    createdAt: Date;
  }> = [
    {
      lead: leadEnviado,
      state: 'sent',
      text: leadEnviado
        ? `Oi ${leadEnviado.fullName.split(' ')[0]}! Aqui é da Atlas Consultoria. O diagnóstico tributário da ${leadEnviado.company} ficou pronto: mapeamos 480 mil reais de crédito de PIS e COFINS a compensar. Posso te mandar o resumo por e-mail?`
        : 'Oi! Aqui é da Atlas Consultoria. O diagnóstico tributário ficou pronto: mapeamos 480 mil reais de crédito de PIS e COFINS a compensar. Posso te mandar o resumo por e-mail?',
      startedAt: new Date(now.getTime() - 2 * 86_400_000),
      createdAt: new Date(now.getTime() - 2 * 86_400_000),
    },
    {
      lead: leadNaFila,
      state: 'queued',
      text: leadNaFila
        ? `Oi ${leadNaFila.fullName.split(' ')[0]}! Aqui é da Atlas. Reservei 45 minutos para revisar a proposta de fechamento da ${leadNaFila.company}. Às 15h funciona para você?`
        : 'Oi! Aqui é da Atlas. Reservei 45 minutos para revisar a proposta de fechamento. Às 15h funciona para você?',
      startedAt: null,
      createdAt: new Date(now.getTime() - 3_600_000),
    },
  ];

  const jobs: VoiceSeedResult['jobs'] = [];
  for (const item of plano) {
    const recipient = item.lead ? fakePhone(item.lead.id) : `+555190000000${item.state === 'sent' ? '1' : '2'}`;
    const jobId = deterministicUuid(`${orgId}:${userId}:${perfil.externalId}:${recipient}:audio`);

    const [existente] = await db
      .select({ id: schema.voiceJobs.id })
      .from(schema.voiceJobs)
      .where(
        and(
          eq(schema.voiceJobs.orgId, orgId),
          eq(schema.voiceJobs.profileId, perfil.externalId),
          eq(schema.voiceJobs.recipient, recipient),
          eq(schema.voiceJobs.kind, 'audio'),
        ),
      )
      .limit(1);

    if (existente) {
      jobs.push({ id: existente.id, state: item.state, kind: 'audio', recipient, created: false });
      continue;
    }

    const [created] = await db
      .insert(schema.voiceJobs)
      .values({
        id: jobId,
        orgId,
        userId,
        profileId: perfil.externalId,
        recipient,
        text: item.text,
        kind: 'audio',
        state: item.state,
        startedAt: item.startedAt,
        createdAt: item.createdAt,
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      jobs.push({ id: created.id, state: item.state, kind: 'audio', recipient, created: true });
      continue;
    }

    // Conflito: a vaga já existe (corrida ou segunda rodada) — reaproveita.
    const [again] = await db
      .select({ id: schema.voiceJobs.id })
      .from(schema.voiceJobs)
      .where(
        and(
          eq(schema.voiceJobs.orgId, orgId),
          eq(schema.voiceJobs.profileId, perfil.externalId),
          eq(schema.voiceJobs.recipient, recipient),
          eq(schema.voiceJobs.kind, 'audio'),
        ),
      )
      .limit(1);
    if (!again) throw new Error('Demo: não foi possível criar o job de voz.');
    jobs.push({ id: again.id, state: item.state, kind: 'audio', recipient, created: false });
  }

  // 3) Registro de cadastro de voz do vendedor (o consentimento fica na fila).
  const registrationId = deterministicUuid(`${orgId}:${userId}:voice-registration`);
  const [registroExistente] = await db
    .select({ id: schema.voiceRegistrations.id })
    .from(schema.voiceRegistrations)
    .where(and(eq(schema.voiceRegistrations.orgId, orgId), eq(schema.voiceRegistrations.userId, userId)))
    .limit(1);

  let registrationCriado = false;
  if (!registroExistente) {
    const [created] = await db
      .insert(schema.voiceRegistrations)
      .values({ id: registrationId, orgId, userId, createdAt: consentAt })
      .onConflictDoNothing()
      .returning();
    registrationCriado = Boolean(created);
  }

  const [registro] = await db
    .select({ id: schema.voiceRegistrations.id })
    .from(schema.voiceRegistrations)
    .where(and(eq(schema.voiceRegistrations.orgId, orgId), eq(schema.voiceRegistrations.userId, userId)))
    .limit(1);

  return {
    profile: { externalId: perfil.externalId, engine: perfil.engine, enabled: perfil.enabled, created: profileCriado },
    jobs,
    registration: { id: registro?.id ?? registrationId, created: registrationCriado },
  };
}
