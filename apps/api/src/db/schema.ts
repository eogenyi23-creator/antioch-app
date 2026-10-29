/**
 * Drizzle ORM schema — PostgreSQL 16.
 * All timestamps are UTC. Amounts are stored as bigint (stroops).
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum('user_role', [
  'donor',
  'applicant',
  'approver',
  'admin',
]);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'published',
  'active',
  'completed',
  'expired',
]);

export const donationStatusEnum = pgEnum('donation_status', [
  'pending',
  'confirmed',
  'failed',
]);

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  stellarAddress: text('stellar_address').notNull().unique(),
  role: userRoleEnum('role').notNull().default('donor'),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// campaigns
// ---------------------------------------------------------------------------

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  story: text('story').notNull(),
  goalStroops: bigint('goal_stroops', { mode: 'bigint' }).notNull(),
  approvers: text('approvers').array().notNull(),
  threshold: integer('threshold').notNull(),
  beneficiary: text('beneficiary').notNull(),
  contractId: text('contract_id'),
  expiryLedger: integer('expiry_ledger'),
  status: campaignStatusEnum('status').notNull().default('draft'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  lastEventLedger: integer('last_event_ledger').notNull().default(0),
  eventCursor: text('event_cursor'),
});

// ---------------------------------------------------------------------------
// milestones
// ---------------------------------------------------------------------------

export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  amountStroops: bigint('amount_stroops', { mode: 'bigint' }).notNull(),
  released: boolean('released').notNull().default(false),
});

// ---------------------------------------------------------------------------
// donations
// ---------------------------------------------------------------------------

export const donations = pgTable('donations', {
  id: uuid('id').primaryKey().defaultRandom(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id),
  donorId: uuid('donor_id')
    .notNull()
    .references(() => users.id),
  amountStroops: bigint('amount_stroops', { mode: 'bigint' }).notNull(),
  txHash: text('tx_hash').unique(),
  status: donationStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// approvals
// ---------------------------------------------------------------------------

export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    milestoneIndex: integer('milestone_index').notNull(),
    approverId: uuid('approver_id')
      .notNull()
      .references(() => users.id),
    txHash: text('tx_hash').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueApproval: unique().on(table.campaignId, table.milestoneIndex, table.approverId),
  }),
);

// ---------------------------------------------------------------------------
// evidence
// ---------------------------------------------------------------------------

export const evidence = pgTable('evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id),
  milestoneIndex: integer('milestone_index').notNull(),
  submittedBy: uuid('submitted_by')
    .notNull()
    .references(() => users.id),
  notes: text('notes'),
  files: jsonb('files').$type<Array<{ url: string; name: string; mime: string }>>(),
  verifierAssessment: jsonb('verifier_assessment').$type<{
    completeness: number;
    consistency: number;
    confidence: number;
    flags: string[];
    assessedAt: string;
  } | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// audit_log
// ---------------------------------------------------------------------------

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id),
  action: text('action').notNull(),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// fee_sponsor_spend
// ---------------------------------------------------------------------------

export const feeSponsorSpend = pgTable('fee_sponsor_spend', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  date: date('date').notNull(),
  amountStroops: bigint('amount_stroops', { mode: 'bigint' }).notNull().default(0n),
  txCount: integer('tx_count').notNull().default(0),
});

// ---------------------------------------------------------------------------
// Convenience type exports
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;

export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;

export type Donation = typeof donations.$inferSelect;
export type NewDonation = typeof donations.$inferInsert;

export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;

export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

export type FeeSponsorSpend = typeof feeSponsorSpend.$inferSelect;
