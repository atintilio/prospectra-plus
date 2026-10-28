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
  seats: integer('seats').notNull().default(5),
  searchCreditsMonth: integer('search_credits_month').notNull().default(300),
  driver: text('driver', { enum: ['assisted', 'unipile'] }).notNull().default('assisted'),
  active: boolean('active').notNull().default(true),
  aiEnabled: boolean('ai_enabled').notNull().default(true),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: createdAt(),
});

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
  qualification: text('qualification').notNull().default(''),
  email: text('email').notNull().default(''),   // merge de CRM: contato completo, não só LinkedIn
  phone: text('phone').notNull().default(''),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('leads_org_url_uq').on(t.orgId, t.linkedinUrl),
  index('leads_org_stage_idx').on(t.orgId, t.stage),
  index('leads_org_owner_idx').on(t.orgId, t.ownerId),
  index('leads_org_email_idx').on(t.orgId, t.email),
  index('leads_org_phone_idx').on(t.orgId, t.phone),
]);

export type StepType = 'react' | 'comment' | 'invite' | 'message' | 'email' | 'whatsapp' | 'voice' | 'image';
export type CampaignStep = {
  id: string;
  type: StepType;
  delayDays: number; // espera antes deste passo, contada a partir do passo anterior
  condition: 'always' | 'accepted';
  template: string;
  useAi: boolean;
  subject?: string; // assunto (apenas passos de e-mail)
  mediaUrl?: string; // URL pública da imagem/informativo (apenas passos de imagem)
};

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
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
  type: text('type', { enum: ['react', 'comment', 'invite', 'message', 'email', 'whatsapp', 'voice', 'image'] }).notNull(),
  body: text('body').notNull().default(''),
  dueDate: date('due_date').notNull(),
  status: text('status', { enum: ['pending', 'done', 'skipped'] }).notNull().default('pending'),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('actions_enrollment_step_uq').on(t.enrollmentId, t.stepIndex),
  index('actions_user_due_idx').on(t.userId, t.status, t.dueDate),
]);

export const EVENT_TYPES = [
  'invite_sent', 'invite_accepted', 'message_sent', 'reply_received', 'reaction_sent', 'comment_sent',
  'email_sent', 'whatsapp_sent', 'voice_sent', 'image_sent', 'meeting_booked', 'deal_won', 'deal_lost', 'ai_search',
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

export type CommercialOffer = {name:string;description:string};
export const commercialProfiles=pgTable('commercial_profiles',{
 orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 sellerName:text('seller_name').notNull(),companyName:text('company_name').notNull(),sellerPhone:text('seller_phone').notNull(),strategy:text('strategy').notNull(),
 offers:jsonb('offers').$type<CommercialOffer[]>().notNull(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[primaryKey({columns:[t.orgId,t.userId]})]);
export const harveyConversations=pgTable('harvey_conversations',{
 id:uuid('id').primaryKey().defaultRandom(),orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),leadId:uuid('lead_id').notNull().references(()=>leads.id,{onDelete:'cascade'}),
 phone:text('phone').notNull(),qualification:text('qualification').notNull(),profile:jsonb('profile').$type<{sellerName:string;companyName:string;sellerPhone:string;strategy:string;offers:CommercialOffer[];communication?:import('@/lib/communication-copy').CommunicationContext}>().notNull(),
 state:text('state',{enum:['active','processing','handoff','stopped']}).notNull().default('active'),turns:integer('turns').notNull().default(0),summary:text('summary').notNull().default(''),
 recipients:jsonb('recipients').$type<string[]>().notNull().default(sql`'[]'::jsonb`),approvedAt:timestamp('approved_at',{withTimezone:true}).notNull().defaultNow(),nextReminderAt:timestamp('next_reminder_at',{withTimezone:true}),
},t=>[uniqueIndex('harvey_conversation_lead_uq').on(t.orgId,t.leadId),uniqueIndex('harvey_conversation_phone_uq').on(t.orgId,t.userId,t.phone)]);
export const harveyInbox=pgTable('harvey_inbox',{
 id:uuid('id').primaryKey().defaultRandom(),conversationId:uuid('conversation_id').notNull().references(()=>harveyConversations.id,{onDelete:'cascade'}),providerId:text('provider_id').notNull(),text:text('text').notNull(),createdAt:createdAt(),
},t=>[uniqueIndex('harvey_inbox_receipt_uq').on(t.conversationId,t.providerId)]);
export const harveyOutbox=pgTable('harvey_outbox',{
 id:uuid('id').primaryKey().defaultRandom(),conversationId:uuid('conversation_id').notNull().references(()=>harveyConversations.id,{onDelete:'cascade'}),kind:text('kind',{enum:['lead','internal','email']}).notNull(),
 recipient:text('recipient').notNull(),body:text('body').notNull(),state:text('state',{enum:['pending','processing','sent','unknown','cancelled']}).notNull().default('pending'),error:text('error'),claimedAt:timestamp('claimed_at',{withTimezone:true}),dueAt:timestamp('due_at',{withTimezone:true}).notNull().defaultNow(),createdAt:createdAt(),
},t=>[index('harvey_outbox_due_idx').on(t.state,t.dueAt)]);
export const harveySellerInbox=pgTable('harvey_seller_inbox',{
 id:uuid('id').primaryKey().defaultRandom(),orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 conversationId:uuid('conversation_id').references(()=>harveyConversations.id,{onDelete:'set null'}),providerId:text('provider_id').notNull(),text:text('text').notNull(),createdAt:createdAt(),
},t=>[uniqueIndex('harvey_seller_inbox_receipt_uq').on(t.orgId,t.userId,t.providerId)]);

export const harveyInboundJobs=pgTable('harvey_inbound_jobs',{
 id:uuid('id').primaryKey().defaultRandom(),orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 providerId:text('provider_id').notNull(),phone:text('phone').notNull(),text:text('text').notNull(),
 state:text('state',{enum:['queued','processing','completed','review']}).notNull().default('queued'),error:text('error'),
 claimedAt:timestamp('claimed_at',{withTimezone:true}),createdAt:createdAt(),
},t=>[uniqueIndex('harvey_inbound_receipt_uq').on(t.orgId,t.userId,t.providerId),index('harvey_inbound_queue_idx').on(t.state,t.createdAt)]);

// Agendamento de reuniões (fase assistida): registro durável do interesse em reunião.
// O disparo/calendário real é configurado manualmente pelo proprietário (MEETING_SCHEDULER_URL
// e/ou Office365 já existente); sem isso, a reunião fica registrada como "requested" para o vendedor.
export const MEETING_STATUSES=['requested','confirmed','cancelled'] as const;
export type MeetingStatus=(typeof MEETING_STATUSES)[number];
export const meetings=pgTable('meetings',{
 id:uuid('id').primaryKey().defaultRandom(),
 orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),
 userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 leadId:uuid('lead_id').notNull().references(()=>leads.id,{onDelete:'cascade'}),
 conversationId:uuid('conversation_id').references(()=>harveyConversations.id,{onDelete:'set null'}),
 status:text('status',{enum:MEETING_STATUSES}).notNull().default('requested'),
 source:text('source',{enum:['harvey','manual']}).notNull().default('manual'),
 schedulerUrl:text('scheduler_url'),
 scheduledAt:timestamp('scheduled_at',{withTimezone:true}),
 note:text('note').notNull().default(''),
 createdAt:createdAt(),
},t=>[
 uniqueIndex('meetings_one_open_per_lead').on(t.orgId,t.leadId).where(sql`status in ('requested','confirmed')`),
 index('meetings_org_status_idx').on(t.orgId,t.status),
 index('meetings_user_idx').on(t.userId,t.createdAt),
]);

// Execução automática de LinkedIn (desligada por padrão: LINKEDIN_AUTOMATION_ENABLED).
// Recibo durável por ação, como em whatsapp_commands: um resultado incerto NUNCA é
// reenviado automaticamente. O canal real de execução (agente do usuário na VM /
// gateway próprio) é plugado via executor; nenhum serviço pago é ativado aqui.
export const linkedinDispatches=pgTable('linkedin_dispatches',{
 id:uuid('id').primaryKey().defaultRandom(),
 orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),
 userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 actionId:uuid('action_id').notNull().references(()=>actions.id,{onDelete:'cascade'}),
 type:text('type',{enum:['react','comment','invite','message']}).notNull(),
 state:text('state',{enum:['pending','sent','unknown']}).notNull().default('pending'),
 providerId:text('provider_id'),
 createdAt:createdAt(),
},t=>[uniqueIndex('linkedin_dispatches_action_uq').on(t.actionId),index('linkedin_dispatches_scope_idx').on(t.orgId,t.userId,t.createdAt)]);

// Suporte (Helpin nativo, fase 1): inbox compartilhada de conversas, nativa no Prospectra+.
// `audience` cobre os dois casos decididos: 'customer' (cliente do parceiro ↔ equipe) e
// 'product' (usuário do Prospectra+ ↔ suporte Argus). `channel` já prevê web e whatsapp.
// Origens do widget são allowlisted por operação: sem origem liberada, o widget recusa.
export const SUPPORT_STATUSES=['open','closed'] as const;
export type SupportStatus=(typeof SUPPORT_STATUSES)[number];
export const supportConversations=pgTable('support_conversations',{
 id:uuid('id').primaryKey().defaultRandom(),
 orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),
 leadId:uuid('lead_id').references(()=>leads.id,{onDelete:'set null'}),
 assignedTo:uuid('assigned_to').references(()=>users.id,{onDelete:'set null'}),
 audience:text('audience',{enum:['customer','product']}).notNull().default('customer'),
 channel:text('channel',{enum:['web','whatsapp','internal']}).notNull().default('web'),
 status:text('status',{enum:SUPPORT_STATUSES}).notNull().default('open'),
 subject:text('subject').notNull().default(''),
 visitorName:text('visitor_name').notNull().default(''),
 visitorEmail:text('visitor_email').notNull().default(''),
 visitorPhone:text('visitor_phone').notNull().default(''),
 labels:text('labels').array().notNull().default(sql`'{}'::text[]`), // etiquetas para classificar/filtrar
 lastMessageAt:timestamp('last_message_at',{withTimezone:true}).notNull().defaultNow(),
 createdAt:createdAt(),
},t=>[index('support_conversations_inbox_idx').on(t.orgId,t.status,t.lastMessageAt),index('support_conversations_lead_idx').on(t.orgId,t.leadId),index('support_conversations_phone_idx').on(t.orgId,t.visitorPhone)]);
export const supportMessages=pgTable('support_messages',{
 id:uuid('id').primaryKey().defaultRandom(),
 conversationId:uuid('conversation_id').notNull().references(()=>supportConversations.id,{onDelete:'cascade'}),
 author:text('author',{enum:['visitor','agent','system']}).notNull(),
 authorUserId:uuid('author_user_id').references(()=>users.id,{onDelete:'set null'}),
 body:text('body').notNull(),
 providerId:text('provider_id'),
 createdAt:createdAt(),
},t=>[index('support_messages_conversation_idx').on(t.conversationId,t.createdAt),uniqueIndex('support_messages_provider_uq').on(t.providerId).where(sql`provider_id is not null`)]);
export const supportWidgetOrigins=pgTable('support_widget_origins',{
 id:uuid('id').primaryKey().defaultRandom(),
 orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),
 origin:text('origin').notNull(),
 createdAt:createdAt(),
},t=>[uniqueIndex('support_widget_origins_uq').on(t.orgId,t.origin)]);

// Central de ajuda (Helpin fase 3): artigos de autoatendimento por operação.
// Busca por texto (ILIKE); busca semântica (pgvector) fica como upgrade futuro.
export const helpArticles=pgTable('help_articles',{
 id:uuid('id').primaryKey().defaultRandom(),
 orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),
 slug:text('slug').notNull(),
 title:text('title').notNull(),
 body:text('body').notNull().default(''),
 status:text('status',{enum:['draft','published']}).notNull().default('draft'),
 createdAt:createdAt(),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('help_articles_slug_uq').on(t.orgId,t.slug),index('help_articles_org_status_idx').on(t.orgId,t.status,t.updatedAt)]);

// Workspace (Helpin fase 5): documentos internos e projetos (tarefas estilo Linear), por operação.
export const docs=pgTable('docs',{
 id:uuid('id').primaryKey().defaultRandom(),
 orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),
 authorId:uuid('author_id').references(()=>users.id,{onDelete:'set null'}),
 title:text('title').notNull(),
 body:text('body').notNull().default(''),
 createdAt:createdAt(),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[index('docs_org_updated_idx').on(t.orgId,t.updatedAt)]);

export const TASK_STATUSES=['todo','doing','done'] as const;
export type TaskStatus=(typeof TASK_STATUSES)[number];
export const tasks=pgTable('tasks',{
 id:uuid('id').primaryKey().defaultRandom(),
 orgId:uuid('org_id').notNull().references(()=>orgs.id,{onDelete:'cascade'}),
 title:text('title').notNull(),
 status:text('status',{enum:TASK_STATUSES}).notNull().default('todo'),
 assignedTo:uuid('assigned_to').references(()=>users.id,{onDelete:'set null'}),
 leadId:uuid('lead_id').references(()=>leads.id,{onDelete:'set null'}),
 createdAt:createdAt(),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[index('tasks_org_status_idx').on(t.orgId,t.status,t.updatedAt)]);
