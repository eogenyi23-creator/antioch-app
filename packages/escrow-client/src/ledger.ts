/**
 * Ledger-to-date and date-to-ledger helpers.
 *
 * Expiry is stored as a ledger sequence number, not a timestamp.
 * At ~5 seconds per ledger, conversions are estimates and must be
 * labelled as such in the UI.
 *
 * Source: https://github.com/eogenyi23-creator/antioch-escrow
 */

import { rpc } from '@stellar/stellar-sdk';

const SECONDS_PER_LEDGER = 5;

/**
 * Fetch the current ledger sequence number from Soroban RPC.
 */
export async function getLatestLedger(rpcUrl: string): Promise<number> {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  const ledger = await server.getLatestLedger();
  return ledger.sequence;
}

/**
 * Convert an expiry Date to a ledger sequence number.
 * Uses the current ledger as the reference point.
 *
 * @param rpcUrl    Soroban RPC URL
 * @param expiryDate  The desired expiry date
 * @returns ledger sequence number (estimate)
 */
export async function dateToLedger(rpcUrl: string, expiryDate: Date): Promise<number> {
  const currentLedger = await getLatestLedger(rpcUrl);
  const nowMs = Date.now();
  const durationMs = expiryDate.getTime() - nowMs;
  if (durationMs <= 0) {
    throw new RangeError('Expiry date must be in the future');
  }
  const durationSeconds = Math.ceil(durationMs / 1000);
  return currentLedger + Math.ceil(durationSeconds / SECONDS_PER_LEDGER);
}

/**
 * Estimate a Date from a ledger sequence number.
 * Uses the current ledger as the reference point.
 *
 * @param rpcUrl        Soroban RPC URL
 * @param expiryLedger  The target ledger sequence number
 * @returns Estimated Date (approximate — label it as such in the UI)
 */
export async function ledgerToDate(rpcUrl: string, expiryLedger: number): Promise<Date> {
  const currentLedger = await getLatestLedger(rpcUrl);
  const ledgersRemaining = expiryLedger - currentLedger;
  const secondsRemaining = ledgersRemaining * SECONDS_PER_LEDGER;
  return new Date(Date.now() + secondsRemaining * 1000);
}

/**
 * Synchronous version: estimate a Date from a ledger number given a known current ledger.
 * Prefer this in UI code where you already have the current ledger from a prior RPC call.
 */
export function ledgerToDateSync(currentLedger: number, expiryLedger: number): Date {
  const ledgersRemaining = expiryLedger - currentLedger;
  const secondsRemaining = ledgersRemaining * SECONDS_PER_LEDGER;
  return new Date(Date.now() + secondsRemaining * 1000);
}
