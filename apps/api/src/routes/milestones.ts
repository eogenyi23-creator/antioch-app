/**
 * Milestone & evidence endpoints:
 *   GET  /campaigns/:id/milestones
 *   POST /campaigns/:id/milestones/:index/evidence
 *   GET  /campaigns/:id/milestones/:index/evidence
 */

import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { milestones, evidence } from '../db/schema.js';
import { requireAuth, validate, ApiError } from '../middleware/index.js';
import { SubmitEvidenceRequestSchema } from '@antioch/shared';
import { getCampaignOrThrow } from './campaigns.js';
import { env } from '../config/env.js';
import {
  readMilestone,
  readApprovals,
} from '@antioch/escrow-client';

const router = Router({ mergeParams: true });

// Helper to get campaignId from merged params safely
function campaignId(req: { params: Record<string, string> }): string {
  return req.params['id'] ?? '';
}

// ---------------------------------------------------------------------------
// GET /campaigns/:id/milestones
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const campaign = await getCampaignOrThrow(campaignId(req));
    const ms = await db
      .select()
      .from(milestones)
      .where(eq(milestones.campaignId, campaign.id));

    // Enrich with on-chain state
    const enriched = await Promise.all(
      ms.map(async (m) => {
        let onChain = null;
        if (campaign.contractId) {
          try {
            const rpcParams = {
              rpcUrl: env.sorobanRpcUrl,
              networkPassphrase: env.networkPassphrase,
              contractId: campaign.contractId,
            };
            const [chainMilestone, approvalCount] = await Promise.all([
              readMilestone({ ...rpcParams, index: m.index }),
              readApprovals({ ...rpcParams, index: m.index }),
            ]);
            onChain = {
              released: chainMilestone.released,
              approvalCount,
              threshold: campaign.threshold,
            };
          } catch {
            // Non-fatal
          }
        }
        return {
          id: m.id,
          index: m.index,
          title: m.title,
          description: m.description,
          amountStroops: m.amountStroops.toString(),
          released: m.released,
          onChain,
        };
      }),
    );

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /campaigns/:id/milestones/:index/evidence  (applicant)
// ---------------------------------------------------------------------------
router.post(
  '/:index/evidence',
  requireAuth(['applicant', 'admin']),
  validate(SubmitEvidenceRequestSchema),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignOrThrow(campaignId(req));
      const index = parseInt((req.params as Record<string, string>)['index'], 10);

      if (isNaN(index)) throw new ApiError(400, 'Invalid milestone index');

      const body = req.body as { notes?: string; files?: Array<{ url: string; name: string; mime: string }> };

      // Check beneficiary owns this campaign
      if (
        req.user!.role !== 'admin' &&
        campaign.beneficiary !== req.user!.stellarAddress
      ) {
        throw new ApiError(403, 'Only the beneficiary can submit evidence');
      }

      const [row] = await db
        .insert(evidence)
        .values({
          campaignId: campaign.id,
          milestoneIndex: index,
          submittedBy: req.user!.id,
          notes: body.notes,
          files: body.files,
        })
        .returning();

      // Fire-and-forget verifier assessment
      if (env.verifierUrl) {
        const ms = await db
          .select()
          .from(milestones)
          .where(
            and(
              eq(milestones.campaignId, campaign.id),
              eq(milestones.index, index),
            ),
          )
          .limit(1);

        requestVerifierAssessment({
          evidenceId: row.id,
          campaignId: campaign.id,
          milestoneIndex: index,
          milestoneDescription: ms[0]?.description ?? '',
          notes: body.notes ?? '',
          files: body.files ?? [],
        }).catch(() => { /* verifier is optional */ });
      }

      res.status(201).json({ id: row.id });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /campaigns/:id/milestones/:index/evidence  (approver or admin)
// ---------------------------------------------------------------------------
router.get(
  '/:index/evidence',
  requireAuth(['approver', 'admin']),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignOrThrow(campaignId(req));
      const index = parseInt((req.params as Record<string, string>)['index'], 10);

      const rows = await db
        .select()
        .from(evidence)
        .where(
          and(
            eq(evidence.campaignId, campaign.id),
            eq(evidence.milestoneIndex, index),
          ),
        );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Verifier helper
// ---------------------------------------------------------------------------

async function requestVerifierAssessment(params: {
  evidenceId: string;
  campaignId: string;
  milestoneIndex: number;
  milestoneDescription: string;
  notes: string;
  files: Array<{ url: string; name: string; mime: string }>;
}): Promise<void> {
  const resp = await fetch(`${env.verifierUrl}/assess`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Auth': env.serviceAuthKey,
    },
    body: JSON.stringify({
      campaign_id: params.campaignId,
      milestone_index: params.milestoneIndex,
      milestone_description: params.milestoneDescription,
      evidence_notes: params.notes,
      evidence_files: params.files.map((f) => ({ name: f.name, mime: f.mime })),
    }),
  });

  if (!resp.ok) return;

  const assessment = (await resp.json()) as {
    completeness: number;
    consistency: number;
    confidence: number;
    flags: string[];
    assessed_at: string;
  };

  await db
    .update(evidence)
    .set({
      verifierAssessment: {
        completeness: assessment.completeness,
        consistency: assessment.consistency,
        confidence: assessment.confidence,
        flags: assessment.flags,
        assessedAt: assessment.assessed_at,
      },
    })
    .where(eq(evidence.id, params.evidenceId));
}

export default router;
