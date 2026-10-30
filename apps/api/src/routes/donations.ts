/**
 * Donation endpoints:
 *   POST /campaigns/:id/donations/init    — build unsigned fund XDR
 *   POST /campaigns/:id/donations/submit  — record tx hash
 *   POST /campaigns/:id/donations/verify  — force on-chain verify
 *   GET  /campaigns/:id/donations         — list (admin)
 */

import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { donations, milestones, users, campaigns } from '../db/schema.js';
import { requireAuth, validate, ApiError } from '../middleware/index.js';
import {
  DonationInitRequestSchema,
  DonationSubmitRequestSchema,
  toStroops,
  fromStroops,
} from '@antioch/shared';
import { getCampaignOrThrow } from './campaigns.js';
import { verifyContractCall } from '../stellar/service.js';
import { env } from '../config/env.js';
import {
  buildFund,
  readFundedTotal,
} from '@antioch/escrow-client';

const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// POST /campaigns/:id/donations/init
// ---------------------------------------------------------------------------
router.post(
  '/init',
  requireAuth(['donor', 'applicant', 'approver', 'admin']),
  validate(DonationInitRequestSchema),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignOrThrow(req.params['id'] as string);
      if (campaign.status !== 'active') {
        throw new ApiError(409, 'Campaign is not accepting donations');
      }
      if (!campaign.contractId) {
        throw new ApiError(409, 'Campaign contract not yet deployed');
      }

      const { idempotencyKey, amount } = req.body as {
        idempotencyKey: string;
        amount: string;
      };

      // Idempotency: if a donation with this key already exists for this user, return it
      const existing = await db
        .select()
        .from(donations)
        .where(
          and(
            eq(donations.idempotencyKey, idempotencyKey),
            eq(donations.donorId, req.user!.id),
          ),
        )
        .limit(1);

      if (existing.length > 0 && existing[0]) {
        const d = existing[0];
        if (d.status === 'confirmed') {
          throw new ApiError(409, 'This donation has already been confirmed');
        }
        // Return the same XDR for pending donations (rebuild it)
      }

      const amountStroops = toStroops(amount);
      if (amountStroops <= 0n) {
        throw new ApiError(422, 'Amount must be positive');
      }

      // Check funding cap
      const rpcParams = {
        rpcUrl: env.sorobanRpcUrl,
        networkPassphrase: env.networkPassphrase,
        contractId: campaign.contractId,
      };
      const fundedTotal = await readFundedTotal(rpcParams);
      const ms = await db
        .select()
        .from(milestones)
        .where(eq(milestones.campaignId, campaign.id));
      const totalCap = ms.reduce((sum, m) => sum + m.amountStroops, 0n);
      const remaining = totalCap - fundedTotal;

      if (amountStroops > remaining) {
        throw new ApiError(
          422,
          `Donation of ${fromStroops(amountStroops)} USDC would exceed the funding cap. ` +
            `Remaining: ${fromStroops(remaining)} USDC`,
        );
      }

      // Build unsigned XDR
      const unsignedXdr = await buildFund({
        rpcUrl: env.sorobanRpcUrl,
        networkPassphrase: env.networkPassphrase,
        contractId: campaign.contractId,
        donor: req.user!.stellarAddress,
        amount: amountStroops,
      });

      // Upsert donation record
      let donationId: string;
      if (existing.length > 0 && existing[0]) {
        donationId = existing[0].id;
      } else {
        const [row] = await db
          .insert(donations)
          .values({
            idempotencyKey,
            campaignId: campaign.id,
            donorId: req.user!.id,
            amountStroops,
          })
          .returning();
        donationId = row.id;
      }

      res.json({
        donationId,
        idempotencyKey,
        unsignedXdr,
        remainingCapStroops: remaining.toString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /campaigns/:id/donations/submit
// ---------------------------------------------------------------------------
router.post(
  '/submit',
  requireAuth(['donor', 'applicant', 'approver', 'admin']),
  validate(DonationSubmitRequestSchema),
  async (req, res, next) => {
    try {
      const { idempotencyKey, txHash } = req.body as {
        idempotencyKey: string;
        txHash: string;
      };

      const [donation] = await db
        .select()
        .from(donations)
        .where(
          and(
            eq(donations.idempotencyKey, idempotencyKey),
            eq(donations.donorId, req.user!.id),
          ),
        )
        .limit(1);

      if (!donation) throw new ApiError(404, 'Donation not found');
      if (donation.status === 'confirmed') {
        return res.json({ ok: true, status: 'confirmed' });
      }

      const [donor] = await db
        .select()
        .from(users)
        .where(eq(users.id, donation.donorId))
        .limit(1);
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, donation.campaignId))
        .limit(1);

      if (!campaign?.contractId) throw new ApiError(409, 'Campaign not deployed');
      if (!donor?.stellarAddress) throw new ApiError(400, 'Donor has no Stellar address');

      const [existingHash] = await db
        .select()
        .from(donations)
        .where(eq(donations.txHash, txHash))
        .limit(1);
      if (existingHash && existingHash.id !== donation.id) {
        throw new ApiError(409, 'Transaction hash already recorded');
      }

      await verifyContractCall(txHash, {
        contractId: campaign.contractId,
        functionName: 'fund',
        donor: donor.stellarAddress,
        amount: donation.amountStroops,
      });

      await db
        .update(donations)
        .set({ txHash, status: 'confirmed', confirmedAt: new Date() })
        .where(eq(donations.id, donation.id));

      res.json({ ok: true, donationId: donation.id, txHash });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /campaigns/:id/donations/verify
// ---------------------------------------------------------------------------
router.post(
  '/verify',
  requireAuth(['donor', 'applicant', 'approver', 'admin']),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignOrThrow(req.params['id'] as string);
      const { donationId } = req.body as { donationId: string };
      const [donation] = await db
        .select()
        .from(donations)
        .where(eq(donations.id, donationId))
        .limit(1);

      if (!donation) throw new ApiError(404, 'Donation not found');
      if (donation.campaignId !== campaign.id) throw new ApiError(404, 'Donation not found');
      if (req.user!.id !== donation.donorId && req.user!.role !== 'admin') {
        throw new ApiError(403, 'Forbidden');
      }

      if (!donation.txHash) throw new ApiError(409, 'No transaction hash recorded yet');

      await verifyAndConfirm(donation.id, donation.txHash);
      const [updated] = await db
        .select()
        .from(donations)
        .where(eq(donations.id, donation.id))
        .limit(1);

      res.json({ status: updated!.status });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /campaigns/:id/donations  (admin)
// ---------------------------------------------------------------------------
router.get('/', requireAuth(['admin']), async (req, res, next) => {
  try {
    const campaign = await getCampaignOrThrow(req.params['id'] as string);
    const rows = await db
      .select()
      .from(donations)
      .where(eq(donations.campaignId, campaign.id));

    res.json(
      rows.map((d) => ({
        id: d.id,
        donorId: d.donorId,
        amountStroops: d.amountStroops.toString(),
        txHash: d.txHash,
        status: d.status,
        createdAt: d.createdAt,
        confirmedAt: d.confirmedAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function verifyAndConfirm(donationId: string, txHash: string): Promise<void> {
  try {
    const [donation] = await db
      .select()
      .from(donations)
      .where(eq(donations.id, donationId))
      .limit(1);
    if (!donation) throw new Error('Donation not found');

    const [donor] = await db
      .select()
      .from(users)
      .where(eq(users.id, donation.donorId))
      .limit(1);
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, donation.campaignId))
      .limit(1);

    if (!campaign.contractId) throw new Error('Campaign has no contract ID');
    if (!donor.stellarAddress) throw new Error('Donor has no Stellar address');

    await verifyContractCall(txHash, {
      contractId: campaign.contractId,
      functionName: 'fund',
      donor: donor.stellarAddress,
      amount: donation.amountStroops,
    });

    await db
      .update(donations)
      .set({ status: 'confirmed', confirmedAt: new Date() })
      .where(eq(donations.id, donationId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const permanent = /on-chain|Mismatch|mismatch|Argument|must contain|Unknown function/i.test(msg);
    if (permanent) {
      await db
        .update(donations)
        .set({ status: 'failed' })
        .where(eq(donations.id, donationId));
    }
  }
}

export default router;
