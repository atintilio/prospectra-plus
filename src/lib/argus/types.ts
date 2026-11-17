import { z } from 'zod';

export type ArgusEvidenceConfidence = 'candidate' | 'probable' | 'confirmed' | 'conflict' | 'unverified';
export type ArgusInvestigationStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';

export const ARGUS_EVIDENCE_CONFIDENCES = ['candidate', 'probable', 'confirmed', 'conflict', 'unverified'] as const;
export const ARGUS_INVESTIGATION_STATUSES = ['queued', 'running', 'completed', 'partial', 'failed'] as const;

export type ArgusEvidence = {
  id: string;
  source: string;
  url: string;
  kind: string;
  title?: string;
  excerpt?: string;
  collectedAt: string;
  confidence: ArgusEvidenceConfidence;
};

export type ArgusCommercialSignal = {
  key: string;
  label: string;
  value: string;
  confidence: ArgusEvidenceConfidence;
  evidenceIds: string[];
};

export type LeadEnrichment = {
  version: 1;
  status: ArgusInvestigationStatus;
  evidence: ArgusEvidence[];
  signals: ArgusCommercialSignal[];
  conflicts: string[];
};

export const argusEvidenceSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  url: z.string().url(),
  kind: z.string().min(1),
  title: z.string().optional(),
  excerpt: z.string().optional(),
  collectedAt: z.string().datetime({ offset: true }),
  confidence: z.enum(ARGUS_EVIDENCE_CONFIDENCES),
}).strict();

export const argusCommercialSignalSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.string(),
  confidence: z.enum(ARGUS_EVIDENCE_CONFIDENCES),
  evidenceIds: z.array(z.string().min(1)).min(1),
}).strict();

export const leadEnrichmentSchema = z.object({
  version: z.literal(1),
  status: z.enum(ARGUS_INVESTIGATION_STATUSES),
  evidence: z.array(argusEvidenceSchema),
  signals: z.array(argusCommercialSignalSchema),
  conflicts: z.array(z.string().min(1)),
}).strict();

export function parseLeadEnrichment(input: unknown): LeadEnrichment {
  return leadEnrichmentSchema.parse(input);
}

export function createLeadEnrichment(): LeadEnrichment {
  return { version: 1, status: 'partial', evidence: [], signals: [], conflicts: [] };
}
