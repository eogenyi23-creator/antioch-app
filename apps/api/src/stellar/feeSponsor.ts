/**
 * Fee-bump sponsorship service.
 *
 * When FEE_SPONSOR_ENABLED=true, wraps eligible transactions in a fee-bump
 * signed by the sponsor account. Enforces per-tx, daily and per-user caps.
 * The fee-bump wrapper cannot move user funds.
 */

import {
  Keypair,
  TransactionBuilder,
  Transaction,
} from '@stellar/stellar-sdk';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { feeSponsorSpend } from '../db/schema.js';
import { env } from '../config/env.js';

export type SponsorableOp = 'fund' | 'approve_milestone' | 'release_milestone' | 'refund';

/**
 * Try to wrap a signed transaction XDR in a fee-bump.
 * Returns the fee-bumped XDR if sponsorship is enabled and caps allow it,
 * otherwise returns the original XDR unchanged.
 */
export async function maybeFeeBump(
  innerXdr: string,
  userId: string,
  _opType: SponsorableOp,
): Promise<string> {
  if (!env.feeSponsorEnabled || !env.feeSponsorSecret) {
    return innerXdr;
  }

  const innerTx = new Transaction(innerXdr, env.networkPassphrase);
  const estimatedFee = BigInt(innerTx.fee);

  // Per-tx cap
  if (estimatedFee > env.feeSponsorMaxPerTx) {
    return innerXdr;
  }

  // Daily and per-user caps
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Fetch or init today's spend row
  const [spendRow] = await db
    .select()
    .from(feeSponsorSpend)
    .where(
      and(eq(feeSponsorSpend.userId, userId), eq(feeSponsorSpend.date, today)),
    )
    .limit(1);

  const userSpentToday = spendRow?.amountStroops ?? 0n;

  if (userSpentToday + estimatedFee > env.feeSponsorMaxPerUserPerDay) {
    return innerXdr;
  }

  // Global daily cap (sum across all users)
  const globalResult = await db
    .select({ total: sql<string>`sum(amount_stroops)` })
    .from(feeSponsorSpend)
    .where(eq(feeSponsorSpend.date, today));

  const globalSpent = BigInt(globalResult[0]?.total ?? '0');
  if (globalSpent + estimatedFee > env.feeSponsorMaxPerDay) {
    return innerXdr;
  }

  // Build fee bump
  const sponsorKeypair = Keypair.fromSecret(env.feeSponsorSecret);
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    sponsorKeypair,
    (Number(estimatedFee) * 10).toString(), // fee for the fee-bump envelope
    innerTx,
    env.networkPassphrase,
  );
  feeBump.sign(sponsorKeypair);

  // Record spend
  if (spendRow) {
    await db
      .update(feeSponsorSpend)
      .set({
        amountStroops: userSpentToday + estimatedFee,
        txCount: (spendRow.txCount ?? 0) + 1,
      })
      .where(eq(feeSponsorSpend.id, spendRow.id));
  } else {
    await db.insert(feeSponsorSpend).values({
      userId,
      date: today,
      amountStroops: estimatedFee,
      txCount: 1,
    });
  }

  return feeBump.toXDR();
}
