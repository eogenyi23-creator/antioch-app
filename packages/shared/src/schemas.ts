/**
 * Zod schemas for all API request and response bodies.
 * Import these in apps/api for request validation and in apps/web for type safety.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Stellar address: 56-character G-address */
const stellarAddress = z
  .string()
  .regex(/^G[A-Z0-9]{55}$/, 'Invalid Stellar address');

/** Stroop value: non-negative integer as string (i128 serialisation) */
const stroopValue = z
  .string()
  .regex(/^\d+$/, 'Amount must be a non-negative integer string (stroops)');

/** UUID */
const uuid = z.string().uuid();

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const AuthChallengeRequestSchema = z.object({
  stellarAddress: stellarAddress,
});

export const AuthVerifyRequestSchema = z.object({
  stellarAddress: stellarAddress,
  /** Base64-encoded signed challenge transaction XDR */
  signedXdr: z.string().min(1),
});

export const AuthRefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const AuthTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

const milestoneInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  /** Amount as decimal USDC string, e.g. "500.0000000" */
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Invalid USDC amount'),
});

export const CreateCampaignRequestSchema = z.object({
  title: z.string().min(1).max(200),
  story: z.string().min(1).max(10000),
  /** Goal in decimal USDC */
  goal: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Invalid USDC amount'),
  beneficiary: stellarAddress,
  approvers: z
    .array(stellarAddress)
    .min(1)
    .max(10)
    .refine((arr) => new Set(arr).size === arr.length, 'Approvers must be unique'),
  threshold: z.number().int().min(1),
  milestones: z.array(milestoneInputSchema).min(1).max(20),
  /** ISO 8601 date string for campaign expiry */
  expiryDate: z.string().datetime(),
});

export const UpdateCampaignRequestSchema = CreateCampaignRequestSchema.partial();

// ---------------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------------

export const DonationInitRequestSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  /** Amount as decimal USDC string */
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Invalid USDC amount'),
});

export const DonationInitResponseSchema = z.object({
  donationId: uuid,
  idempotencyKey: z.string(),
  /** Base64-encoded unsigned XDR */
  unsignedXdr: z.string(),
  /** Remaining fundable amount in stroops */
  remainingCapStroops: stroopValue,
});

export const DonationSubmitRequestSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  txHash: z.string().min(1),
});

export const DonationVerifyRequestSchema = z.object({
  donationId: uuid,
});

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const SubmitEvidenceRequestSchema = z.object({
  notes: z.string().max(5000).optional(),
  files: z
    .array(
      z.object({
        url: z.string().url(),
        name: z.string().min(1).max(255),
        mime: z.string().min(1).max(100),
      }),
    )
    .max(20)
    .optional(),
});

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export const ApproveInitRequestSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
});

export const ApproveInitResponseSchema = z.object({
  /** Base64-encoded unsigned XDR */
  unsignedXdr: z.string(),
});

export const ApproveSubmitRequestSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  txHash: z.string().min(1),
});

export const ReleaseInitRequestSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
});

export const ReleaseSubmitRequestSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  txHash: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export const RefundInitResponseSchema = z.object({
  /** Base64-encoded unsigned XDR */
  unsignedXdr: z.string(),
  /** Estimated refund amount in stroops */
  estimatedRefundStroops: stroopValue,
});

export const RefundSubmitRequestSchema = z.object({
  txHash: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const UpdateUserRoleRequestSchema = z.object({
  role: z.enum(['donor', 'applicant', 'approver', 'admin']),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type AuthChallengeRequest = z.infer<typeof AuthChallengeRequestSchema>;
export type AuthVerifyRequest = z.infer<typeof AuthVerifyRequestSchema>;
export type AuthRefreshRequest = z.infer<typeof AuthRefreshRequestSchema>;
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;

export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;
export type UpdateCampaignRequest = z.infer<typeof UpdateCampaignRequestSchema>;

export type DonationInitRequest = z.infer<typeof DonationInitRequestSchema>;
export type DonationInitResponse = z.infer<typeof DonationInitResponseSchema>;
export type DonationSubmitRequest = z.infer<typeof DonationSubmitRequestSchema>;
export type DonationVerifyRequest = z.infer<typeof DonationVerifyRequestSchema>;

export type SubmitEvidenceRequest = z.infer<typeof SubmitEvidenceRequestSchema>;

export type ApproveInitRequest = z.infer<typeof ApproveInitRequestSchema>;
export type ApproveInitResponse = z.infer<typeof ApproveInitResponseSchema>;
export type ApproveSubmitRequest = z.infer<typeof ApproveSubmitRequestSchema>;
export type ReleaseInitRequest = z.infer<typeof ReleaseInitRequestSchema>;
export type ReleaseSubmitRequest = z.infer<typeof ReleaseSubmitRequestSchema>;

export type RefundInitResponse = z.infer<typeof RefundInitResponseSchema>;
export type RefundSubmitRequest = z.infer<typeof RefundSubmitRequestSchema>;

export type UpdateUserRoleRequest = z.infer<typeof UpdateUserRoleRequestSchema>;
