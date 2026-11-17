export type Confidence = 'candidate' | 'probable' | 'confirmed' | 'conflict' | 'unverified';
export type InvestigationStatus = 'completed' | 'partial' | 'failed';

export type InvestigationTarget = {
  name?: string;
  urls?: string[];
  company?: string;
  person?: string;
  domain?: string;
  email?: string;
  profileUrl?: string;
};

export type InvestigationRequest = {
  id: string;
  target: InvestigationTarget;
  sources?: SourceAdapter[];
};

export type Evidence = {
  id: string;
  source: string;
  url: string;
  kind: string;
  value: string;
  collectedAt: string;
  confidence: Confidence;
};

export type CommercialSignal = {
  key: string;
  value: string;
  confidence: Confidence;
  evidenceIds: string[];
};

export type InvestigationResult = {
  id: string;
  status: InvestigationStatus;
  evidence: Evidence[];
  signals: CommercialSignal[];
  conflicts: string[];
  errors: string[];
};

export type SourceAdapter = {
  name: string;
  collect(target: InvestigationTarget): Promise<Evidence[]>;
};

export type ArgusTarget = InvestigationTarget;
export type ArgusEvidence = { id: string; source: string; url: string; title?: string; excerpt?: string; collectedAt: string; correlationKey: string };
export type ArgusSource = 'website' | 'wikipedia' | 'github';
export type ArgusFetch = (input: string, init?: RequestInit) => Promise<Response>;
