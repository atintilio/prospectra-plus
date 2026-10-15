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
