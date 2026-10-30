import { sql } from 'drizzle-orm';
import {
  boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  passwordHash: text('password_hash'),
  platformRole: text('platform_role', { enum: ['admin', 'user'] }).notNull().default('user'),
  status: text('status', { enum: ['invited', 'active', 'disabled'] }).notNull().default('invited'),
  linkedinUrl: text('linkedin_url'),
  dailyInvites: integer('daily_invites').notNull().default(15),
  dailyMessages: integer('daily_messages').notNull().default(40),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('users_email_uq').on(t.email)]);

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  planId: uuid('plan_id'),
  seats: integer('seats').notNull().default(5),
  searchCreditsMonth: integer('search_credits_month').notNull().default(300),
  driver: text('driver', { enum: ['assisted', 'unipile'] }).notNull().default('assisted'),
  active: boolean('active').notNull().default(true),
  aiEnabled: boolean('ai_enabled').notNull().default(true),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: createdAt(),
});

// Estrutura configurável de planos e limites (sem preço fixado neste momento).
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  seats: integer('seats').notNull().default(5),
  searchCreditsMonth: integer('search_credits_month').notNull().default(300),
  features: jsonb('features').$type<Record<string, boolean>>().notNull().default(sql`'{}'::jsonb`),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('plans_name_uq').on(t.name)]);

export const memberships = pgTable('memberships', {
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'manager', 'sdr', 'closer'] }).notNull().default('sdr'),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index('memberships_user_idx').on(t.userId)]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // sha256 do token
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

export const authTokens = pgTable('auth_tokens', {
  id: text('id').primaryKey(), // sha256 do token
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['invite', 'reset'] }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('auth_tokens_user_idx').on(t.userId)]);

export const LEAD_STAGES = ['new', 'invited', 'connected', 'replied', 'meeting', 'won', 'lost', 'do_not_contact'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  linkedinUrl: text('linkedin_url').notNull(),
  fullName: text('full_name').notNull(),
  headline: text('headline').notNull().default(''),
  company: text('company').notNull().default(''),
  location: text('location').notNull().default(''),
  tag: text('tag').notNull().default(''),
  source: text('source', { enum: ['import', 'search', 'manual', 'signal'] }).notNull().default('import'),
  stage: text('stage', { enum: LEAD_STAGES }).notNull().default('new'),
  notes: text('notes').notNull().default(''),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('leads_org_url_uq').on(t.orgId, t.linkedinUrl),
  index('leads_org_stage_idx').on(t.orgId, t.stage),
  index('leads_org_owner_idx').on(t.orgId, t.ownerId),
]);

export type StepType = 'react' | 'comment' | 'invite' | 'message';
export type CampaignStep = {
  id: string;
  type: StepType;
  delayDays: number; // espera antes deste passo, contada a partir do passo anterior
  condition: 'always' | 'accepted';
  template: string;
  useAi: boolean;
};

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  linkedinAccountId: uuid('linkedin_account_id'),
  name: text('name').notNull(),
  status: text('status', { enum: ['draft', 'active', 'paused', 'finished'] }).notNull().default('draft'),
  steps: jsonb('steps').$type<CampaignStep[]>().notNull().default(sql`'[]'::jsonb`),
  aiBrief: text('ai_brief').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [index('campaigns_org_status_idx').on(t.orgId, t.status)]);

export const enrollments = pgTable('enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull().default(0),
  state: text('state', { enum: ['running', 'waiting_accept', 'done', 'stopped'] }).notNull().default('running'),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('enrollments_one_active_per_lead').on(t.orgId, t.leadId).where(sql`state in ('running','waiting_accept')`),
  index('enrollments_campaign_idx').on(t.campaignId, t.state),
  index('enrollments_due_idx').on(t.state, t.nextRunAt),
]);

export const actions = pgTable('actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  enrollmentId: uuid('enrollment_id').notNull().references(() => enrollments.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull(),
  type: text('type', { enum: ['react', 'comment', 'invite', 'message'] }).notNull(),
  body: text('body').notNull().default(''),
  dueDate: date('due_date').notNull(),
  status: text('status', { enum: ['pending', 'done', 'skipped'] }).notNull().default('pending'),
  dispatchState: text('dispatch_state', { enum: ['none', 'sent', 'unknown'] }).notNull().default('none'),
  providerId: text('provider_id'),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('actions_enrollment_step_uq').on(t.enrollmentId, t.stepIndex),
  index('actions_user_due_idx').on(t.userId, t.status, t.dueDate),
]);

export const EVENT_TYPES = [
  'invite_sent', 'invite_accepted', 'message_sent', 'reply_received', 'reaction_sent', 'comment_sent',
  'meeting_booked', 'deal_won', 'deal_lost', 'ai_search',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  type: text('type', { enum: EVENT_TYPES }).notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('events_org_type_at_idx').on(t.orgId, t.type, t.at), index('events_org_user_at_idx').on(t.orgId, t.userId, t.at)]);

// Linha do tempo do piloto automático SIMULADO (só existe na organização de demonstração).
export const SIM_KINDS = ['invite', 'message', 'accept', 'reply', 'auto_reply', 'handoff', 'post', 'comment'] as const;
export type SimKind = (typeof SIM_KINDS)[number];
export const simFeed = pgTable('sim_feed', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  kind: text('kind', { enum: SIM_KINDS }).notNull(),
  body: text('body').notNull().default(''),
  detail: text('detail').notNull().default(''),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('sim_feed_org_at_idx').on(t.orgId, t.at)]);


// Auditoria do proprietário: registro persistente e fila de aviso de exclusões.
export const deletionReports = pgTable('deletion_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').notNull(),
  actorEmail: text('actor_email').notNull(),
  orgId: uuid('org_id').notNull(),
  orgName: text('org_name').notNull(),
  records: jsonb('records').$type<{ id: string; name: string }[]>().notNull(),
  createdAt: createdAt(),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
}, t => [index('deletion_reports_pending_idx').on(t.notifiedAt, t.claimedAt)]);

// Receipts survive retries; an uncertain send is never retried automatically.
export const whatsappCommands = pgTable('whatsapp_commands', {
 id: uuid('id').primaryKey(),
 orgId: uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),
 userId: uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 payloadHash:text('payload_hash').notNull(),
 state:text('state',{enum:['pending','sent','unknown']}).notNull().default('pending'),
 providerMessageId:text('provider_message_id'),
 createdAt:createdAt(),
},t=>[index('whatsapp_commands_user_created_idx').on(t.userId,t.createdAt)]);

export const intelligenceJobs = pgTable('intelligence_jobs', {
 id:uuid('id').primaryKey(),
 orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),
 userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 leadId:uuid('lead_id').notNull().references(()=>leads.id,{onDelete:'cascade'}),
 state:text('state',{enum:['queued','running','completed','failed','cancelled']}).notNull().default('queued'),
 result:jsonb('result').$type<{score:number;priority:string;factors:Record<string,number>;hot:boolean;priorityAvailable?:boolean;unavailableFactors?:string[]}>(),
 error:text('error'),
 attempts:integer('attempts').notNull().default(0),
 claimedAt:timestamp('claimed_at',{withTimezone:true}),
 completedAt:timestamp('completed_at',{withTimezone:true}),
 createdAt:createdAt(),
},t=>[index('intelligence_jobs_claim_idx').on(t.state,t.createdAt),index('intelligence_jobs_scope_idx').on(t.orgId,t.userId,t.createdAt)]);

export const voiceProfiles=pgTable('voice_profiles',{
 orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),
 userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 externalId:text('external_id').notNull(),engine:text('engine').notNull(),
 enabled:boolean('enabled').notNull().default(true),consentAt:timestamp('consent_at',{withTimezone:true}).notNull(),
},t=>[primaryKey({columns:[t.orgId,t.userId]})]);
export const voiceRegistrations=pgTable('voice_registrations',{
 id:uuid('id').primaryKey().defaultRandom(),
 orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),
 userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),createdAt:createdAt(),
},t=>[index('voice_registrations_user_created_idx').on(t.userId,t.createdAt)]);
export const voiceJobs=pgTable('voice_jobs',{
 id:uuid('id').primaryKey(),orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),
 userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 profileId:text('profile_id').notNull(),recipient:text('recipient').notNull(),text:text('text').notNull(),
 kind:text('kind',{enum:['audio','call']}).notNull(),
 state:text('state',{enum:['queued','running','sent','unknown','failed','waiting_transport']}).notNull(),
 createdAt:createdAt(),startedAt:timestamp('started_at',{withTimezone:true}),
},t=>[index('voice_jobs_scope_idx').on(t.orgId,t.userId,t.createdAt),index('voice_jobs_queue_idx').on(t.state,t.createdAt)]);

// ---------- Go LinkedIn ----------
// Conta(s) LinkedIn do usuário, sempre vinculada a orgId + userId.
// O MVP usa uma conta por usuário; o modelo permite várias no futuro.
export const LINKEDIN_ACCOUNT_STATUSES = ['waiting', 'connected', 'expired', 'blocked', 'disconnected'] as const;
export type LinkedInStatus = (typeof LINKEDIN_ACCOUNT_STATUSES)[number];
export const linkedinAccounts = pgTable('linkedin_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull().default('Principal'),
  providerId: text('provider_id'),
  status: text('status', { enum: LINKEDIN_ACCOUNT_STATUSES }).notNull().default('waiting'),
  // Sessão do LinkedIn (cookie/token) — cifrada no servidor com AES-256-GCM; nunca em texto puro.
  sessionEnc: text('session_enc'),
  demo: boolean('demo').notNull().default(false),
  lastError: text('last_error'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('linkedin_accounts_user_idx').on(t.orgId, t.userId)]);

// ---------- Agenda ----------
export const MEETING_STATUSES = ['requested', 'confirmed', 'cancelled'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export const meetings = pgTable('meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  // Token da URL pública de agendamento/gerenciamento da reunião.
  publicId: text('public_id').notNull(),
  title: text('title').notNull().default('Reunião'),
  requesterName: text('requester_name').notNull(),
  requesterEmail: text('requester_email').notNull(),
  slot: timestamp('slot', { withTimezone: true }).notNull(),
  durationMin: integer('duration_min').notNull().default(30),
  status: text('status', { enum: MEETING_STATUSES }).notNull().default('requested'),
  // Estado do convite .ics e do envio por e-mail (para exibir erros na Agenda).
  icsState: text('ics_state', { enum: ['none', 'queued', 'sent', 'error'] }).notNull().default('none'),
  icsError: text('ics_error'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('meetings_public_id_uq').on(t.publicId),
  index('meetings_org_slot_idx').on(t.orgId, t.slot),
]);

// ---------- Helpin (suporte/inbox) ----------
export const helpinConversations = pgTable('helpin_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  subject: text('subject').notNull().default(''),
  contactName: text('contact_name').notNull().default(''),
  channel: text('channel', { enum: ['helpin', 'whatsapp', 'email'] }).notNull().default('helpin'),
  status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [index('helpin_conv_org_status_idx').on(t.orgId, t.status, t.lastMessageAt)]);

export const helpinMessages = pgTable('helpin_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull().references(() => helpinConversations.id, { onDelete: 'cascade' }),
  // "contact" = lead/cliente; "agent" = equipe. Na demo, o envio do agente é simulado.
  sender: text('sender', { enum: ['contact', 'agent'] }).notNull(),
  body: text('body').notNull(),
  simulated: boolean('simulated').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index('helpin_msg_conv_idx').on(t.conversationId, t.createdAt)]);

// ---------- Configurações por organização ----------
export const orgSettings = pgTable('org_settings', {
  orgId: uuid('org_id').primaryKey().references(() => orgs.id, { onDelete: 'cascade' }),
  senderEmail: text('sender_email'),
  atendimentoStart: text('atendimento_start').notNull().default('09:00'),
  atendimentoEnd: text('atendimento_end').notNull().default('18:00'),
  autoReply: text('auto_reply').notNull().default(''),
  // Recursos ligados/desligados por organização (ex.: whatsapp, voice, inteligencia, golinkedin).
  features: jsonb('features').$type<Record<string, boolean>>().notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Documentos ----------
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  url: text('url').notNull().default(''),
  notes: text('notes').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [index('documents_org_idx').on(t.orgId, t.createdAt)]);
