/**
 * Campaign endpoints:
 *   GET    /campaigns
 *   GET    /campaigns/:id
 *   POST   /campaigns
 *   PATCH  /campaigns/:id
 *   POST   /campaigns/:id/publish
 *   GET    /campaigns/:id/transparency
 */

import { Router } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { campaigns, milestones, donations, approvals } from '../db/schema.js';
import { requireAuth, validate, ApiError, writeAuditLog } from '../middleware/index.js';
import {
  CreateCampaignRequestSchema,
  UpdateCampaignRequestSchema,
  toStroops,
} from '@antioch/shared';
import {
  deployCampaignEscrow,
  hasTrustline,
} from '../stellar/service.js';
import {
  readState,
  readFundedTotal,
  readReleasedTotal,
} from '@antioch/escrow-client';
import { env } from '../config/env.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /campaigns
// ---------------------------------------------------------------------------
router.get('/', async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(campaigns)
      .where(inArray(campaigns.status, ['active', 'completed', 'expired']));
    res.json(rows.map(formatCampaign));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /campaigns/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
  try {
    const campaign = await getCampaignOrThrow(req.params['id'] as string);
    const ms = await db
      .select()
      .from(milestones)
      .where(eq(milestones.campaignId, campaign.id));

    // Enrich with on-chain state if contract is deployed
    let onChain = null;
    if (campaign.contractId) {
      try {
        const rpcParams = {
          rpcUrl: env.sorobanRpcUrl,
          networkPassphrase: env.networkPassphrase,
          contractId: campaign.contractId,
        };
        const [state, fundedTotal, releasedTotal] = await Promise.all([
          readState(rpcParams),
          readFundedTotal(rpcParams),
          readReleasedTotal(rpcParams),
        ]);
        const totalCap = ms.reduce((sum, m) => sum + m.amountStroops, 0n);
        onChain = {
          state,
          fundedTotal: fundedTotal.toString(),
          releasedTotal: releasedTotal.toString(),
          remainingCap: (totalCap - fundedTotal).toString(),
        };
      } catch {
        // Non-fatal — contract reads can fail in CI
      }
    }

    res.json({ ...formatCampaign(campaign), milestones: ms.map(formatMilestone), onChain });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /campaigns  (applicant)
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireAuth(['applicant', 'admin']),
  validate(CreateCampaignRequestSchema),
  async (req, res, next) => {
    try {
      const body = req.body;
      const goalStroops = toStroops(body.goal);

      const [campaign] = await db
        .insert(campaigns)
        .values({
          title: body.title,
          story: body.story,
          goalStroops,
          beneficiary: body.beneficiary,
          approvers: body.approvers,
          threshold: body.threshold,
          createdBy: req.user!.id,
        })
        .returning();

      // Insert milestones
      const msRows = body.milestones.map(
        (m: { title: string; description?: string; amount: string }, idx: number) => ({
          campaignId: campaign.id,
          index: idx,
          title: m.title,
          description: m.description,
          amountStroops: toStroops(m.amount),
        }),
      );
      await db.insert(milestones).values(msRows);

      res.status(201).json({ id: campaign.id, status: campaign.status });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /campaigns/:id  (applicant owner or admin)
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  requireAuth(['applicant', 'admin']),
  validate(UpdateCampaignRequestSchema),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignOrThrow(req.params['id'] as string);
      if (campaign.status !== 'draft') {
        throw new ApiError(409, 'Only draft campaigns can be edited');
      }
      if (req.user!.role !== 'admin' && campaign.createdBy !== req.user!.id) {
        throw new ApiError(403, 'Forbidden');
      }

      const body = req.body;
      const updates: Partial<typeof campaigns.$inferInsert> = {};
      if (body.title) updates.title = body.title;
      if (body.story) updates.story = body.story;
      if (body.goal) updates.goalStroops = toStroops(body.goal);
      if (body.beneficiary) updates.beneficiary = body.beneficiary;
      if (body.approvers) updates.approvers = body.approvers;
      if (body.threshold) updates.threshold = body.threshold;

      const [updated] = await db
        .update(campaigns)
        .set(updates)
        .where(eq(campaigns.id, campaign.id))
        .returning();

      if (body.milestones) {
        await db.delete(milestones).where(eq(milestones.campaignId, campaign.id));
        const msRows = body.milestones.map(
          (m: { title: string; description?: string; amount: string }, idx: number) => ({
            campaignId: campaign.id,
            index: idx,
            title: m.title,
            description: m.description,
            amountStroops: toStroops(m.amount),
          }),
        );
        await db.insert(milestones).values(msRows);
      }

      res.json(formatCampaign(updated));
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /campaigns/:id/publish  (admin)
// ---------------------------------------------------------------------------
router.post('/:id/publish', requireAuth(['admin']), async (req, res, next) => {
  try {
    const campaign = await getCampaignOrThrow(req.params['id'] as string);
    if (campaign.status !== 'draft' && campaign.status !== 'published') {
      throw new ApiError(409, 'Campaign is already active or beyond');
    }

    const ms = await db
      .select()
      .from(milestones)
      .where(eq(milestones.campaignId, campaign.id));

    if (ms.length === 0) throw new ApiError(422, 'Campaign has no milestones');

    // Validate threshold
    if (campaign.threshold > campaign.approvers.length) {
      throw new ApiError(422, 'Threshold exceeds number of approvers');
    }

    // Check beneficiary trustline
    const trustlineOk = await hasTrustline(campaign.beneficiary);
    if (!trustlineOk) {
      throw new ApiError(
        422,
        `Beneficiary ${campaign.beneficiary} does not hold a trustline for ${env.usdcAssetCode}. ` +
          `The beneficiary must add a trustline before the campaign can be published.`,
      );
    }

    // Convert expiry date to ledger
    if (!campaign.expiryLedger) {
      throw new ApiError(422, 'Campaign has no expiry date');
    }

    let deployLedger: number | undefined;
    const contractId = await deployCampaignEscrow(
      {
        approvers: campaign.approvers,
        threshold: campaign.threshold,
        beneficiary: campaign.beneficiary,
        milestoneAmounts: ms.map((m) => m.amountStroops),
        expiryLedger: campaign.expiryLedger,
      },
      (l) => {
        deployLedger = l;
      },
    );

    const [updated] = await db
      .update(campaigns)
      .set({ contractId, status: 'active', publishedAt: new Date(), deployLedger: deployLedger ?? null })
      .where(eq(campaigns.id, campaign.id))
      .returning();

    await writeAuditLog(req.user!.id, 'campaign.publish', 'campaign', campaign.id, {
      contractId,
    });

    res.json(formatCampaign(updated));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /campaigns/:id/transparency
// ---------------------------------------------------------------------------
router.get('/:id/transparency', async (req, res, next) => {
  try {
    const campaign = await getCampaignOrThrow(req.params['id'] as string);
    const [ms, donationRows, approvalRows] = await Promise.all([
      db.select().from(milestones).where(eq(milestones.campaignId, campaign.id)),
      db
        .select()
        .from(donations)
        .where(eq(donations.campaignId, campaign.id)),
      db
        .select()
        .from(approvals)
        .where(eq(approvals.campaignId, campaign.id)),
    ]);

    res.json({
      campaign: formatCampaign(campaign),
      milestones: ms.map(formatMilestone),
      donations: donationRows.map((d) => ({
        id: d.id,
        amountStroops: d.amountStroops.toString(),
        txHash: d.txHash,
        status: d.status,
        createdAt: d.createdAt,
      })),
      approvals: approvalRows.map((a) => ({
        id: a.id,
        milestoneIndex: a.milestoneIndex,
        txHash: a.txHash,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getCampaignOrThrow(id: string) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) throw new ApiError(404, 'Campaign not found');
  return campaign;
}

function formatCampaign(c: typeof campaigns.$inferSelect) {
  return {
    id: c.id,
    title: c.title,
    story: c.story,
    goalStroops: c.goalStroops.toString(),
    beneficiary: c.beneficiary,
    approvers: c.approvers,
    threshold: c.threshold,
    contractId: c.contractId,
    expiryLedger: c.expiryLedger,
    status: c.status,
    createdBy: c.createdBy,
    createdAt: c.createdAt,
    publishedAt: c.publishedAt,
  };
}

function formatMilestone(m: typeof milestones.$inferSelect) {
  return {
    id: m.id,
    index: m.index,
    title: m.title,
    description: m.description,
    amountStroops: m.amountStroops.toString(),
    released: m.released,
  };
}

export { getCampaignOrThrow };
export default router;
