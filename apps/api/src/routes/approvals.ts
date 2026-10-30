/**
 * Approval & release endpoints:
 *   POST /campaigns/:id/milestones/:index/approve
 *   POST /campaigns/:id/milestones/:index/approve/submit
 *   POST /campaigns/:id/milestones/:index/release
 *   POST /campaigns/:id/milestones/:index/release/submit
 *
 * Refund endpoints:
 *   POST /campaigns/:id/refund/init
 *   POST /campaigns/:id/refund/submit
 */

import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { approvals, milestones } from '../db/schema.js';
import { requireAuth, validate, ApiError, writeAuditLog } from '../middleware/index.js';
import {
  ApproveInitRequestSchema,
  ApproveSubmitRequestSchema,
  ReleaseInitRequestSchema,
  ReleaseSubmitRequestSchema,
} from '@antioch/shared';
import { getCampaignOrThrow } from './campaigns.js';
import { verifyContractCall, hasTrustline } from '../stellar/service.js';
import { env } from '../config/env.js';
import {
  buildApproveMilestone,
  buildReleaseMilestone,
  buildRefund,
  readApprovals,
  readFundedTotal,
  readReleasedTotal,
  readDonorContribution,
} from '@antioch/escrow-client';

// ---------------------------------------------------------------------------
// Approvals router  (mounted at /campaigns/:id/milestones)
// ---------------------------------------------------------------------------
const approvalsRouter = Router({ mergeParams: true });

// POST /:index/approve — build unsigned approve_milestone XDR
approvalsRouter.post(
  '/:index/approve',
  requireAuth(['approver', 'admin']),
  validate(ApproveInitRequestSchema),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignOrThrow(req.params['id'] as string);
      const index = parseInt(req.params['index'] as string, 10);
      if (!campaign.contractId) throw new ApiError(409, 'Campaign not yet deployed');

      // Check the approver is in the approver list
      if (
        req.user!.role !== 'admin' &&
        !campaign.approvers.includes(req.user!.stellarAddress)
      ) {
        throw new ApiError(403, 'You are not an approver for this campaign');
      }

      // Check for duplicate approval
      const existing = await db
        .select()
        .from(approvals)
        .where(
          and(
            eq(approvals.campaignId, campaign.id),
            eq(approvals.milestoneIndex, index),
            eq(approvals.approverId, req.user!.id),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new ApiError(409, 'You have already approved this milestone');
      }

      // If this approval will reach the threshold, check beneficiary trustline
      const rpcParams = {
        rpcUrl: env.sorobanRpcUrl,
        networkPassphrase: env.networkPassphrase,
        contractId: campaign.contractId,
      };
      const currentApprovals = await readApprovals({ ...rpcParams, index });
      if (currentApprovals + 1 >= campaign.threshold) {
        const ok = await hasTrustline(campaign.beneficiary);
        if (!ok) {
          throw new ApiError(
            422,
            `This approval will reach the threshold, but the beneficiary does not hold a ` +
              `trustline for ${env.usdcAssetCode}. The beneficiary must add a trustline first.`,
          );
        }
      }

      const unsignedXdr = await buildApproveMilestone({
        rpcUrl: env.sorobanRpcUrl,
        networkPassphrase: env.networkPassphrase,
        contractId: campaign.contractId,
        approver: req.user!.stellarAddress,
        index,
      });

      res.json({ unsignedXdr });
    } catch (err) {
      next(err);
    }
  },
);

// POST /:index/approve/submit — record approval tx hash
approvalsRouter.post(
  '/:index/approve/submit',
  requireAuth(['approver', 'admin']),
  validate(ApproveSubmitRequestSchema),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignOrThrow(req.params['id'] as string);
      const index = parseInt(req.params['index'] as string, 10);
      const { txHash } = req.body as { idempotencyKey: string; txHash: string };

      if (!campaign.contractId) throw new ApiError(409, 'Campaign not yet deployed');
      if (!req.user!.stellarAddress) throw new ApiError(400, 'Approver has no Stellar address');
      const [existingApproval] = await db
        .select()
        .from(approvals)
        .where(eq(approvals.txHash, txHash))
        .limit(1);
      if (existingApproval) throw new ApiError(409, 'Transaction hash already recorded');

      await verifyContractCall(txHash, {
        contractId: campaign.contractId,
        functionName: 'approve_milestone',
        approver: req.user!.stellarAddress,
        milestoneIndex: index,
      });

      const [row] = await db
        .insert(approvals)
        .values({
          campaignId: campaign.id,
          milestoneIndex: index,
          approverId: req.user!.id,
          txHash,
        })
        .returning();

      await writeAuditLog(req.user!.id, 'milestone.approve', 'milestone', `${campaign.id}:${index}`, { txHash });

      res.json({ id: row.id });
    } catch (err) {
      next(err);
    }
  },
);

// POST /:index/release — build unsigned release_milestone XDR (anyone authenticated)
approvalsRouter.post(
  '/:index/release',
  requireAuth(),
  validate(ReleaseInitRequestSchema),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignOrThrow(req.params['id'] as string);
      const index = parseInt(req.params['index'] as string, 10);
      if (!campaign.contractId) throw new ApiError(409, 'Campaign not yet deployed');

      const unsignedXdr = await buildReleaseMilestone({
        rpcUrl: env.sorobanRpcUrl,
        networkPassphrase: env.networkPassphrase,
        contractId: campaign.contractId,
        caller: req.user!.stellarAddress,
        index,
      });

      res.json({ unsignedXdr });
    } catch (err) {
      next(err);
    }
  },
);

// POST /:index/release/submit
approvalsRouter.post(
  '/:index/release/submit',
  requireAuth(),
  validate(ReleaseSubmitRequestSchema),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignOrThrow(req.params['id'] as string);
      const index = parseInt(req.params['index'] as string, 10);
      const { txHash } = req.body as { idempotencyKey: string; txHash: string };

      if (!campaign.contractId) throw new ApiError(409, 'Campaign not yet deployed');
      const [existingRelease] = await db
        .select()
        .from(approvals)
        .where(eq(approvals.txHash, txHash))
        .limit(1);
      if (existingRelease) throw new ApiError(409, 'Transaction hash already recorded');

      await verifyContractCall(txHash, {
        contractId: campaign.contractId,
        functionName: 'release_milestone',
        milestoneIndex: index,
      });

      // Update milestone released flag
      await db
        .update(milestones)
        .set({ released: true })
        .where(
          and(
            eq(milestones.campaignId, campaign.id),
            eq(milestones.index, index),
          ),
        );

      await writeAuditLog(req.user!.id, 'milestone.release', 'milestone', `${campaign.id}:${index}`, { txHash });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Refunds router  (mounted at /campaigns/:id)
// ---------------------------------------------------------------------------
const refundsRouter = Router({ mergeParams: true });

// POST /refund/init
refundsRouter.post(
  '/init',
  requireAuth(['donor', 'applicant', 'approver', 'admin']),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignOrThrow(req.params['id'] as string);
      if (campaign.status !== 'expired' && campaign.status !== 'active') {
        throw new ApiError(409, 'Campaign has not expired yet');
      }
      if (!campaign.contractId) throw new ApiError(409, 'Campaign not deployed');

      const rpcParams = {
        rpcUrl: env.sorobanRpcUrl,
        networkPassphrase: env.networkPassphrase,
        contractId: campaign.contractId,
      };

      // Estimate refund amount
      const [fundedTotal, releasedTotal, contribution] = await Promise.all([
        readFundedTotal(rpcParams),
        readReleasedTotal(rpcParams),
        readDonorContribution({ ...rpcParams, donor: req.user!.stellarAddress }),
      ]);

      if (contribution === 0n) {
        throw new ApiError(422, 'No contribution found for this donor');
      }

      const unreleasedBalance = fundedTotal - releasedTotal;
      const estimatedRefund =
        fundedTotal > 0n ? (contribution * unreleasedBalance) / fundedTotal : 0n;

      const unsignedXdr = await buildRefund({
        rpcUrl: env.sorobanRpcUrl,
        networkPassphrase: env.networkPassphrase,
        contractId: campaign.contractId,
        donor: req.user!.stellarAddress,
      });

      res.json({
        unsignedXdr,
        estimatedRefundStroops: estimatedRefund.toString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /refund/submit
refundsRouter.post(
  '/submit',
  requireAuth(['donor', 'applicant', 'approver', 'admin']),
  async (req, res, next) => {
    try {
      const { txHash } = req.body as { txHash: string };
      const campaign = await getCampaignOrThrow(req.params['id'] as string);
      if (!campaign.contractId) throw new ApiError(409, 'Campaign not yet deployed');
      if (!req.user!.stellarAddress) throw new ApiError(400, 'Donor has no Stellar address');
      await verifyContractCall(txHash, {
        contractId: campaign.contractId,
        functionName: 'refund',
        donor: req.user!.stellarAddress,
      });
      await writeAuditLog(req.user!.id, 'refund.submit', 'campaign', campaign.id, { txHash });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export { approvalsRouter, refundsRouter };
