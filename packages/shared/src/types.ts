/**
 * Shared enums and domain types used across web, API and shared schemas.
 */

export type UserRole = 'donor' | 'applicant' | 'approver' | 'admin';

export type CampaignStatus =
  | 'draft'
  | 'published'
  | 'active'
  | 'completed'
  | 'expired';

export type DonationStatus = 'pending' | 'confirmed' | 'failed';

export type ContractState =
  | 'Uninitialized'
  | 'Active'
  | 'Completed'
  | 'Expired';

// -------------------------------------------------------------------------
// Lightweight domain objects shared between API responses and web UI
// -------------------------------------------------------------------------

export interface UserSummary {
  id: string;
  stellarAddress: string;
  role: UserRole;
  displayName?: string | null;
}

export interface MilestoneSummary {
  id: string;
  index: number;
  title: string;
  description?: string | null;
  amountStroops: string; // bigint serialised as string
  released: boolean;
}

export interface CampaignSummary {
  id: string;
  title: string;
  story: string;
  goalStroops: string;
  beneficiary: string;
  approvers: string[];
  threshold: number;
  contractId?: string | null;
  expiryLedger?: number | null;
  status: CampaignStatus;
  createdAt: string;
  publishedAt?: string | null;
}

export interface DonationSummary {
  id: string;
  campaignId: string;
  amountStroops: string;
  txHash?: string | null;
  status: DonationStatus;
  createdAt: string;
  confirmedAt?: string | null;
}

export interface ApprovalSummary {
  id: string;
  campaignId: string;
  milestoneIndex: number;
  approverStellarAddress: string;
  txHash?: string | null;
  createdAt: string;
}

export interface EvidenceFile {
  url: string;
  name: string;
  mime: string;
}

export interface VerifierAssessment {
  completeness: number;
  consistency: number;
  confidence: number;
  flags: string[];
  assessedAt: string;
}
