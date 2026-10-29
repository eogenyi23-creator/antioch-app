/**
 * Background jobs:
 * - Reconciliation: every 5 minutes, verify pending donations/approvals
 * - TTL maintenance: daily, call maintain_ttl on active campaigns
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { campaigns, donations, milestones, users, approvals } from '../db/schema.js';
import { verifyContractCall, sorobanServer } from '../stellar/service.js';
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
  scValToNative,
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
      await verifyContractCall(
        donation.txHash,
        {
          contractId: campaign?.contractId ?? undefined,
          functionName: 'fund',
          donor: donor?.stellarAddress,
          amount: donation.amountStroops,
        },
        3,
      );
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
      await processCampaignEvents(campaign);
    } catch {
      // Non-fatal per campaign
    }
    try {
      await syncMilestoneReleases(campaign.id, campaign.contractId);
    } catch {
      // Non-fatal per campaign
    }
  }
}
export interface DecodedContractEvent {
  kind: 'fund' | 'approve' | 'release' | 'refund';
  txHash: string;
  ledger: number;
  donor?: string;
  approver?: string;
  milestoneIndex?: number;
  amount?: bigint;
}

export function decodeContractEvent(event: unknown): DecodedContractEvent | null {
  try {
    const e = event as {
      topic?: unknown[];
      value?: unknown;
      txHash?: unknown;
      tx_hash?: unknown;
      ledger?: unknown;
    };
    const topic = (e.topic || []).map((t) => scValToNative(t as never));
    const value = e.value ? scValToNative(e.value as never) : undefined;
    const first = String(topic[0] ?? '').toLowerCase();
    const txHash = String(e.txHash ?? e.tx_hash ?? '');
    const ledger = Number(e.ledger ?? 0);

    let kind: DecodedContractEvent['kind'] | null = null;
    if (first.includes('refund')) kind = 'refund';
    else if (first.includes('approve')) kind = 'approve';
    else if (first.includes('release')) kind = 'release';
    else if (first.includes('fund')) kind = 'fund';
    if (!kind) return null;

    const decoded: DecodedContractEvent = { kind, txHash, ledger };

    if (kind === 'fund') {
      decoded.donor = String(topic[1] ?? '');
      const amt =
        typeof value === 'bigint'
          ? value
          : typeof value === 'object' && value !== null
            ? (value.amount ?? value.value ?? 0n)
            : 0n;
      decoded.amount = typeof amt === 'bigint' ? amt : BigInt(amt as never);
    } else if (kind === 'approve') {
      decoded.approver = String(topic[1] ?? '');
      decoded.milestoneIndex = Number(topic[2] ?? 0);
    } else if (kind === 'release') {
      decoded.milestoneIndex = Number(topic[1] ?? 0);
      if (typeof value === 'object' && value !== null) {
        const amt = (value as { amount?: unknown; value?: unknown }).amount ?? (value as { amount?: unknown; value?: unknown }).value;
        if (amt !== undefined) {
          decoded.amount = typeof amt === 'bigint' ? amt : BigInt(amt as never);
        }
      }
    } else if (kind === 'refund') {
      decoded.donor = String(topic[1] ?? '');
      const amt =
        typeof value === 'bigint'
          ? value
          : typeof value === 'object' && value !== null
            ? (value.amount ?? value.value ?? 0n)
            : 0n;
      decoded.amount = typeof amt === 'bigint' ? amt : BigInt(amt as never);
    }

    return decoded;
  } catch {
    return null;
  }
}

export async function processCampaignEvents(campaign: unknown): Promise<void> {
  const c = campaign as {
    id: string;
    contractId?: string | null;
    eventCursor?: string | null;
    lastEventLedger?: number | null;
  };
  if (!c?.contractId) return;

  const filters = [{ type: 'contract', contractIds: [c.contractId] }];
  let cursor = c.eventCursor || undefined;
  const startLedger = c.lastEventLedger || 0;

  for (let page = 0; page < 10; page++) {
    const req: Record<string, unknown> = { filters, limit: 100 };
    if (cursor) req.cursor = cursor;
    else req.startLedger = startLedger > 0 ? startLedger : 1;

    const res = await sorobanServer.getEvents(req as never);
    const events = Array.isArray(res?.events) ? res.events : [];

    for (const ev of events) {
      const decoded = decodeContractEvent(ev);
      if (!decoded) continue;

      if (decoded.kind === 'fund') {
        if (!decoded.donor) continue;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.stellarAddress, decoded.donor))
          .limit(1);
        const donorUser =
          user ||
          (await db
            .insert(users)
            .values({ stellarAddress: decoded.donor, role: 'donor' })
            .returning())[0];

        const existing = await db
          .select()
          .from(donations)
          .where(eq(donations.txHash, decoded.txHash))
          .limit(1);
        if (existing.length === 0) {
          await db
            .insert(donations)
            .values({
              idempotencyKey: decoded.txHash,
              campaignId: c.id,
              donorId: donorUser.id,
              amountStroops: decoded.amount ?? 0n,
              txHash: decoded.txHash,
              status: 'confirmed',
              confirmedAt: new Date(),
            })
            .catch(() => {});
        }
      } else if (decoded.kind === 'approve') {
        if (!decoded.approver || decoded.milestoneIndex === undefined) continue;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.stellarAddress, decoded.approver))
          .limit(1);
        const approverUser =
          user ||
          (await db
            .insert(users)
            .values({ stellarAddress: decoded.approver, role: 'approver' })
            .returning())[0];

        const existing = await db
          .select()
          .from(approvals)
          .where(eq(approvals.txHash, decoded.txHash))
          .limit(1);
        if (existing.length === 0) {
          await db
            .insert(approvals)
            .values({
              campaignId: c.id,
              milestoneIndex: decoded.milestoneIndex,
              approverId: approverUser.id,
              txHash: decoded.txHash,
            })
            .catch(() => {});
        }
      } else if (decoded.kind === 'release') {
        if (decoded.milestoneIndex === undefined) continue;
        await db
          .update(milestones)
          .set({ released: true })
          .where(
            and(
              eq(milestones.campaignId, c.id),
              eq(milestones.index, decoded.milestoneIndex),
            ),
          );
      } else if (decoded.kind === 'refund') {
        // No dedicated table; cursor update is enough.
      }
    }

    const lastLedger = events.length
      ? Math.max(...events.map((e) => Number((e as { ledger?: unknown }).ledger ?? 0)))
      : startLedger;

    cursor = res?.cursor || cursor;
    await db
      .update(campaigns)
      .set({
        lastEventLedger: lastLedger > 0 ? lastLedger : (c.lastEventLedger ?? 0),
        eventCursor: cursor || c.eventCursor || undefined,
      })
      .where(eq(campaigns.id, c.id));

    if (!events.length || !res?.cursor) break;
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
