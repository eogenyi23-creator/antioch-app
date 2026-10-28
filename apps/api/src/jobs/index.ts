/**
 * Background jobs:
 * - Reconciliation: every 5 minutes, verify pending donations/approvals
 * - TTL maintenance: daily, call maintain_ttl on active campaigns
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { campaigns, donations, milestones } from '../db/schema.js';
import { verifyTransaction, sorobanServer } from '../stellar/service.js';
import { env } from '../config/env.js';
import {
  readMilestone,
  readMilestoneCount,
  readState,
} from '@antioch/escrow-client';
import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Keypair,
  TimeoutInfinite,
  nativeToScVal,
} from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Reconciliation job
// ---------------------------------------------------------------------------

export async function runReconciliation(): Promise<void> {
  const pending = await db
    .select()
    .from(donations)
    .where(eq(donations.status, 'pending'));

  for (const donation of pending) {
    if (!donation.txHash) continue;
    try {
      await verifyTransaction(donation.txHash, 3); // quick check only
      await db
        .update(donations)
        .set({ status: 'confirmed', confirmedAt: new Date() })
        .where(eq(donations.id, donation.id));
    } catch {
      // Mark failed if txHash is old (> 5 minutes without confirmation)
      const age = Date.now() - (donation.createdAt?.getTime() ?? 0);
      if (age > 5 * 60 * 1000) {
        await db
          .update(donations)
          .set({ status: 'failed' })
          .where(eq(donations.id, donation.id));
      }
    }
  }

  // Sync milestone released flags from on-chain state
  const activeCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.status, 'active'));

  for (const campaign of activeCampaigns) {
    if (!campaign.contractId) continue;
    try {
      await syncMilestoneReleases(campaign.id, campaign.contractId);
    } catch {
      // Non-fatal per campaign
    }
  }
}

async function syncMilestoneReleases(
  campaignId: string,
  contractId: string,
): Promise<void> {
  const rpcParams = {
    rpcUrl: env.sorobanRpcUrl,
    networkPassphrase: env.networkPassphrase,
    contractId,
  };

  const [state, count] = await Promise.all([
    readState(rpcParams),
    readMilestoneCount(rpcParams),
  ]);

  if (state === 'Completed') {
    await db
      .update(campaigns)
      .set({ status: 'completed' })
      .where(eq(campaigns.id, campaignId));
  } else if (state === 'Expired') {
    await db
      .update(campaigns)
      .set({ status: 'expired' })
      .where(eq(campaigns.id, campaignId));
  }

  for (let i = 0; i < count; i++) {
    const ms = await readMilestone({ ...rpcParams, index: i });
    if (ms.released) {
      await db
        .update(milestones)
        .set({ released: true })
        .where(
          and(eq(milestones.campaignId, campaignId), eq(milestones.index, i)),
        );
    }
  }
}

// ---------------------------------------------------------------------------
// TTL maintenance job
// ---------------------------------------------------------------------------

export async function runTtlMaintenance(): Promise<void> {
  const activeCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.status, 'active'));

  const deployerKeypair = Keypair.fromSecret(env.deployerSecret);

  for (const campaign of activeCampaigns) {
    if (!campaign.contractId) continue;
    try {
      const account = await sorobanServer.getAccount(deployerKeypair.publicKey());
      const contract = new Contract(campaign.contractId);
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: env.networkPassphrase,
      })
        .addOperation(
          contract.call('maintain_ttl', nativeToScVal(0, { type: 'u32' })),
        )
        .setTimeout(TimeoutInfinite)
        .build();

      const prepared = await sorobanServer.prepareTransaction(tx);
      prepared.sign(deployerKeypair);
      await sorobanServer.sendTransaction(prepared);
    } catch {
      // Non-fatal — TTL maintenance is best-effort
    }
  }
}

// ---------------------------------------------------------------------------
// Job scheduler
// ---------------------------------------------------------------------------

export function startJobs(): void {
  // Reconciliation every 5 minutes
  setInterval(() => {
    runReconciliation().catch((err) =>
      console.error('[reconciliation]', err),
    );
  }, 5 * 60 * 1000);

  // TTL maintenance once per day
  setInterval(() => {
    runTtlMaintenance().catch((err) =>
      console.error('[ttl-maintenance]', err),
    );
  }, 24 * 60 * 60 * 1000);
}
