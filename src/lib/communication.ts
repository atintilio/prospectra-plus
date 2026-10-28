import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, schema, type DB } from '@/db';
import type {CommunicationContext} from './communication-copy';
import { inferDisc } from './communication-discovery';

import { canAccessLead, estimateDiscType, getCommunicationGuidance, isDiscType, sanitizeCommunicationPreferences } from "./communication-guidance";
import type { CommunicationGuidance, CommunicationPreferences, CommunicationScope, CommunicationSource, DiscType, EvidenceLabel, ObservationAnswers } from './communication-guidance';
export { canAccessLead, estimateDiscType, getCommunicationGuidance, isDiscType, sanitizeCommunicationPreferences } from './communication-guidance';
export type { CommunicationPreferences, CommunicationScope, CommunicationSource, DiscQuadrant, DiscType, EvidenceLabel, ObservationAnswers } from './communication-guidance';

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: unknown[] }).rows;
  }
  return [];
}

export type LeadCommunicationProfile = {
  orgId: string;
  leadId: string;
  userId: string;
  source: CommunicationSource;
  evidenceLabel: EvidenceLabel;
  profileType: DiscType | null;
  answers: Partial<ObservationAnswers>;
  preferences: CommunicationPreferences;
  assessedAt: Date;
  guidance: CommunicationGuidance | null;
};

export function communicationContext(profile:LeadCommunicationProfile|null):CommunicationContext|undefined{
 if(!profile?.guidance||profile.evidenceLabel==='unavailable')return undefined;
 return {quadrant:profile.guidance.quadrant,evidenceLabel:profile.evidenceLabel,tone:profile.guidance.tone,format:profile.guidance.format,preferredFormat:profile.preferences.preferredFormat};
}

type ProfileRow = {
  org_id: string;
  lead_id: string;
  user_id: string;
  source: CommunicationSource;
  evidence_label: EvidenceLabel;
  profile_type: string | null;
  answers: ObservationAnswers | Record<string, never>;
  preferences: CommunicationPreferences;
  assessed_at: Date | string;
};

function mapProfile(row: ProfileRow | undefined): LeadCommunicationProfile | null {
  if (!row) return null;
  const profileType = isDiscType(row.profile_type) ? row.profile_type : null;
  return {
    orgId: row.org_id,
    leadId: row.lead_id,
    userId: row.user_id,
    source: row.source,
    evidenceLabel: row.evidence_label,
    profileType,
    answers: row.answers ?? {},
    preferences: sanitizeCommunicationPreferences(row.preferences),
    assessedAt: row.assessed_at instanceof Date ? row.assessed_at : new Date(row.assessed_at),
    guidance: getCommunicationGuidance(profileType),
  };
}

export async function getLeadCommunicationProfile(db: DB, scope: CommunicationScope, leadId: string): Promise<LeadCommunicationProfile | null> {
  const result = await db.execute(sql`
    SELECT p.org_id, p.lead_id, p.user_id, p.source, p.evidence_label, p.profile_type, p.answers, p.preferences, p.assessed_at
    FROM leads l
    JOIN lead_communication_profiles p ON p.org_id = l.org_id AND p.lead_id = l.id
    WHERE l.org_id = ${scope.orgId} AND l.owner_id = ${scope.userId} AND l.id = ${leadId}
    LIMIT 1
  `);
  return mapProfile(resultRows(result)[0] as ProfileRow | undefined);
}

export async function listLeadCommunicationProfiles(db: DB, scope: CommunicationScope): Promise<Array<{
  id: string; fullName: string; company: string; profile: LeadCommunicationProfile | null;
}>> {
  const result = await db.execute(sql`
    SELECT l.id, l.full_name, l.company, p.org_id, p.lead_id, p.user_id, p.source, p.evidence_label,
      p.profile_type, p.answers, p.preferences, p.assessed_at
    FROM leads l
    LEFT JOIN lead_communication_profiles p ON p.org_id = l.org_id AND p.lead_id = l.id
    WHERE l.org_id = ${scope.orgId} AND l.owner_id = ${scope.userId}
    ORDER BY l.created_at DESC
    LIMIT 200
  `);
  return resultRows(result).map((raw) => {
    const row = raw as Record<string, unknown>;
    const profile = row.source ? mapProfile({
      org_id: row.org_id as string, lead_id: row.lead_id as string, user_id: row.user_id as string,
      source: row.source as CommunicationSource, evidence_label: row.evidence_label as EvidenceLabel,
      profile_type: row.profile_type as string | null, answers: row.answers as ProfileRow['answers'],
      preferences: row.preferences as CommunicationPreferences, assessed_at: row.assessed_at as Date | string,
    }) : null;
    return { id: row.id as string, fullName: row.full_name as string, company: row.company as string, profile };
  });
}

export async function saveLeadCommunicationProfile(
  db: DB,
  scope: CommunicationScope,
  leadId: string,
  input: {
    source: CommunicationSource;
    profileType?: unknown;
    answers?: unknown;
    preferences?: unknown;
  },
): Promise<LeadCommunicationProfile | null> {
  const source = input.source;
  let profileType: DiscType | null = null;
  let evidenceLabel: EvidenceLabel = 'unavailable';
  let answers: ObservationAnswers | Record<string, never> = {};

  if (source === 'manual') {
    if (input.profileType && !isDiscType(input.profileType)) throw new Error('Tipo declarado inválido.');
    profileType = isDiscType(input.profileType) ? input.profileType : null;
    evidenceLabel = profileType ? 'declared' : 'unavailable';
  } else if (source === 'observational_quiz') {
    const estimate = estimateDiscType(input.answers);
    if (estimate.status === 'incomplete') throw new Error('Responda às quatro perguntas para salvar a estimativa.');
    answers = input.answers as ObservationAnswers;
    profileType = estimate.status === 'estimate' ? estimate.type : null;
    evidenceLabel = estimate.status === 'estimate' ? 'estimate' : 'unavailable';
  } else if (source === 'inferred') {
    // Descoberta automática (IA/léxico): sempre estimativa, nunca "declarado".
    if (input.profileType && !isDiscType(input.profileType)) throw new Error('Tipo inferido inválido.');
    profileType = isDiscType(input.profileType) ? input.profileType : null;
    evidenceLabel = profileType ? 'estimate' : 'unavailable';
  } else {
    throw new Error('Origem do perfil inválida.');
  }
  const preferences = sanitizeCommunicationPreferences(input.preferences);

  return db.transaction(async (tx) => {
    const [lead] = await tx.select({ id: schema.leads.id, orgId: schema.leads.orgId, ownerId: schema.leads.ownerId })
      .from(schema.leads)
      .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, scope.orgId), eq(schema.leads.ownerId, scope.userId)))
      .for('update');
    if (!canAccessLead(lead, scope)) throw new Error('Lead indisponível para este usuário.');
    await tx.execute(sql`
      INSERT INTO lead_communication_profiles (org_id, lead_id, user_id, source, evidence_label, profile_type, answers, preferences, assessed_at, updated_at)
      VALUES (${scope.orgId}, ${leadId}, ${scope.userId}, ${source}, ${evidenceLabel}, ${profileType}, ${JSON.stringify(answers)}::jsonb, ${JSON.stringify(preferences)}::jsonb, now(), now())
      ON CONFLICT (org_id, lead_id) DO UPDATE SET
        user_id = EXCLUDED.user_id, source = EXCLUDED.source, evidence_label = EXCLUDED.evidence_label,
        profile_type = EXCLUDED.profile_type, answers = EXCLUDED.answers, preferences = EXCLUDED.preferences,
        assessed_at = CASE WHEN (lead_communication_profiles.source, lead_communication_profiles.evidence_label, lead_communication_profiles.profile_type, lead_communication_profiles.answers)
          IS DISTINCT FROM (EXCLUDED.source, EXCLUDED.evidence_label, EXCLUDED.profile_type, EXCLUDED.answers)
          THEN now() ELSE lead_communication_profiles.assessed_at END,
        updated_at = now()
    `);
    return getLeadCommunicationProfile(tx as unknown as DB, scope, leadId);
  });
}

export async function getCommunicationGuidanceForLead(scope: CommunicationScope, leadId: string): Promise<LeadCommunicationProfile | null> {
  return getLeadCommunicationProfile(await getDb(), scope, leadId);
}

/**
 * Descoberta DISC em massa: infere o perfil (estilo "Previsto" do Crystal) dos leads que ainda
 * não têm perfil de comunicação. Roda em lotes pelo cron — nunca inline no upload, porque a IA
 * por lead estouraria o tempo da requisição. Lead sem sinal recebe perfil "indisponível", o que
 * o tira da fila (não é reprocessado). Isola por operação ativa e vendedor dono do lead.
 */
export async function discoverPendingDisc(db: DB, opts: { orgId?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(1, opts.limit ?? 25), 100);
  const result = await db.execute(sql`
    SELECT l.id, l.org_id AS "orgId", l.owner_id AS "ownerId", l.full_name AS "fullName", l.headline, l.company, l.location
    FROM leads l
    JOIN orgs o ON o.id = l.org_id
    JOIN users u ON u.id = l.owner_id
    LEFT JOIN lead_communication_profiles p ON p.org_id = l.org_id AND p.lead_id = l.id
    WHERE p.lead_id IS NULL AND l.owner_id IS NOT NULL AND l.stage <> 'do_not_contact'
      AND o.active AND NOT o.is_demo AND u.status = 'active'
      ${opts.orgId ? sql`AND l.org_id = ${opts.orgId}` : sql``}
    ORDER BY l.created_at
    LIMIT ${limit}
  `);
  const rows = resultRows(result) as { id: string; orgId: string; ownerId: string; fullName: string; headline: string; company: string; location: string }[];
  let inferred = 0;
  for (const r of rows) {
    const text = [r.fullName, r.headline, r.company, r.location].filter(Boolean).join(' — ');
    const { type } = await inferDisc(text);
    // Salva sempre (type null → "indisponível"), para não reprocessar o mesmo lead a cada rodada.
    await saveLeadCommunicationProfile(db, { orgId: r.orgId, userId: r.ownerId }, r.id, { source: 'inferred', profileType: type });
    if (type) inferred++;
  }
  return { processed: rows.length, inferred };
}
