/**
 * /me endpoints:
 *   GET /me/donations
 *   GET /me/donations/:id/receipt
 *   GET /me/donations/export
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { donations, campaigns } from '../db/schema.js';
import { requireAuth, ApiError } from '../middleware/index.js';
import { fromStroops } from '@antioch/shared';

const router = Router();

// ---------------------------------------------------------------------------
// GET /me/donations
// ---------------------------------------------------------------------------
router.get('/donations', requireAuth(), async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: donations.id,
        campaignId: donations.campaignId,
        amountStroops: donations.amountStroops,
        txHash: donations.txHash,
        status: donations.status,
        createdAt: donations.createdAt,
        confirmedAt: donations.confirmedAt,
        campaignTitle: campaigns.title,
      })
      .from(donations)
      .leftJoin(campaigns, eq(donations.campaignId, campaigns.id))
      .where(eq(donations.donorId, req.user!.id));

    res.json(
      rows.map((d) => ({
        id: d.id,
        campaignId: d.campaignId,
        campaignTitle: d.campaignTitle,
        amountStroops: d.amountStroops.toString(),
        amountUsdc: fromStroops(d.amountStroops),
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
// GET /me/donations/export  (must come before /:id to avoid shadowing)
// ---------------------------------------------------------------------------
router.get('/donations/export', requireAuth(), async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: donations.id,
        campaignTitle: campaigns.title,
        amountStroops: donations.amountStroops,
        txHash: donations.txHash,
        status: donations.status,
        createdAt: donations.createdAt,
        confirmedAt: donations.confirmedAt,
      })
      .from(donations)
      .leftJoin(campaigns, eq(donations.campaignId, campaigns.id))
      .where(eq(donations.donorId, req.user!.id));

    const header = 'id,campaign,amount_usdc,tx_hash,status,created_at,confirmed_at\n';
    const lines = rows
      .map(
        (d) =>
          [
            d.id,
            `"${(d.campaignTitle ?? '').replace(/"/g, '""')}"`,
            fromStroops(d.amountStroops),
            d.txHash ?? '',
            d.status,
            d.createdAt?.toISOString() ?? '',
            d.confirmedAt?.toISOString() ?? '',
          ].join(','),
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="donations.csv"');
    res.send(header + lines);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /me/donations/:id/receipt
// ---------------------------------------------------------------------------
router.get('/donations/:id/receipt', requireAuth(), async (req, res, next) => {
  try {
    const [row] = await db
      .select({
        id: donations.id,
        campaignId: donations.campaignId,
        amountStroops: donations.amountStroops,
        txHash: donations.txHash,
        status: donations.status,
        createdAt: donations.createdAt,
        confirmedAt: donations.confirmedAt,
        campaignTitle: campaigns.title,
      })
      .from(donations)
      .leftJoin(campaigns, eq(donations.campaignId, campaigns.id))
      .where(eq(donations.id, req.params['id'] as string))
      .limit(1);

    if (!row) throw new ApiError(404, 'Donation not found');
    if (row.id !== req.user!.id) {
      // Check ownership via donor_id directly
      const [full] = await db
        .select()
        .from(donations)
        .where(eq(donations.id, row.id))
        .limit(1);
      if (!full || full.donorId !== req.user!.id) {
        throw new ApiError(403, 'Forbidden');
      }
    }

    res.json({
      receipt: {
        id: row.id,
        campaignTitle: row.campaignTitle,
        amountUsdc: fromStroops(row.amountStroops),
        amountStroops: row.amountStroops.toString(),
        txHash: row.txHash,
        status: row.status,
        donorAddress: req.user!.stellarAddress,
        createdAt: row.createdAt,
        confirmedAt: row.confirmedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
