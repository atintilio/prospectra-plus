export type Journey = 'Aquisição' | 'Expansão / ABM' | 'Reativação';
export type Relationship = 'Prospect' | 'Cliente' | 'Ex-cliente' | 'Perdido' | 'Dormente';
export type TaskState = 'Pendente' | 'Aguardando revisão' | 'Aprovado' | 'Pausado' | 'Concluído';
export type CopyState = 'Rascunho' | 'Aprovado' | 'Invalidado';
export type Channel = 'WhatsApp' | 'LinkedIn' | 'Email';
export type ChannelCapability = 'API não oficial configurável' | 'API autorizada' | 'Assistido' | 'Não configurado';

export interface Evidence {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  source: 'Web pública' | 'Importação' | 'Operador';
  collectedAt: string;
  verified: boolean;
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  email: string;
  phone?: string;
  optIn?: boolean;
  linkedin: string;
  reviewedAt: string;
  status: 'Revisado' | 'A revisar';
}

export interface Activity {
  id: string;
  kind: 'Nota' | 'Evidência' | 'Resposta' | 'Aprovação' | 'Tarefa';
  text: string;
  createdAt: string;
  actor: string;
}

export interface Account {
  id: string;
  name: string;
  domain: string;
  sector: string;
  employees: string;
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3';
  journey: Journey;
  relationship: Relationship;
  owner: string;
  score: number;
  scoreReason: string;
  stage: string;
  paused: boolean;
  suppressed: boolean;
  contacts: Contact[];
  evidence: Evidence[];
  activities: Activity[];
}

export interface CopyReview {
  text: string;
  revision: number;
  state: CopyState;
  approvedAt?: string;
}

export interface CampaignTask {
  id: string;
  accountId: string;
  contactId: string;
  title: string;
  channel: Channel;
  capability: ChannelCapability;
  state: TaskState;
  due: string;
  providerMessageId?: string;
  providerStatus?: string;
  completedAt?: string;
  approval?: {
    copyRevision: number;
    contactId: string;
    channel: Channel;
    evidenceIds: string[];
    approvedAt: string;
  };
}

export interface Campaign {
  id: string;
  name: string;
  status: 'Ativa' | 'Em revisão';
  icp: string;
  accounts: string[];
  copy: CopyReview;
  tasks: CampaignTask[];
}

export interface ChannelConnection {
  id: 'whatsapp' | 'linkedin';
  name: 'WhatsApp' | 'LinkedIn';
  provider: string;
  capability: ChannelCapability;
  status: 'Pronto para configurar' | 'Conectado' | 'Pausado' | 'Não configurado';
  detail: string;
  routes: string[];
  dailyCap: number;
}

export interface AgentProfile {
  name: string;
  voice: string;
  instruction: string;
  reviewMode: 'Toda mensagem' | 'Somente respostas' | 'Autonomia por playbook';
  enabled: boolean;
  mode: 'Teste' | 'Produção';
}

export interface PlaybookStep {
  id: string;
  title: string;
  detail: string;
  channel: Channel | 'Todos';
  wait: string;
  active: boolean;
}

export interface Signal {
  id: string;
  channel: Channel;
  title: string;
  detail: string;
  accountId: string;
  priority: 'Alta' | 'Média' | 'Baixa';
  state: 'Novo' | 'Em handoff' | 'Resolvido';
  createdAt: string;
}

export type TeamRole = 'Administrador' | 'Líder' | 'Liderado';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  teamId?: string;
}

export interface Team {
  id: string;
  name: string;
  leaderId: string;
  memberIds: string[];
  color: 'purple' | 'emerald' | 'lilac';
}

export interface Opportunity {
  id: string;
  teamId: string;
  ownerId: string;
  accountId: string;
  thesis: string;
  stage: string;
  potential: number;
  confidence: number;
  updatedAt: string;
}

export interface Diagnosis {
  id: string;
  opportunityId: string;
  title: string;
  introduction: string;
  legalBasis: string[];
  calculationMemory: string[];
  evidence: string[];
  recommendation: string;
  status: 'Gerado' | 'Em revisão';
}

export interface ProspectraState {
  accounts: Account[];
  campaigns: Campaign[];
  channels: ChannelConnection[];
  agent: AgentProfile;
  playbook: PlaybookStep[];
  signals: Signal[];
  teams: Team[];
  members: TeamMember[];
  opportunities: Opportunity[];
  diagnoses: Diagnosis[];
  selectedAccountId: string;
  selectedCampaignId: string;
}
