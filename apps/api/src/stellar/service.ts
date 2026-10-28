/**
 * Stellar / Soroban service layer.
 *
 * Responsibilities:
 * - Build and sign the campaign deploy transaction (DEPLOYER_SECRET only)
 * - Check beneficiary trustline
 * - Verify an on-chain transaction
 * - Read current ledger
 */

import {
  Keypair,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  Operation,
  Address,
  nativeToScVal,
  xdr,
  TimeoutInfinite,
} from '@stellar/stellar-sdk';
import { env } from '../config/env.js';

const server = new SorobanRpc.Server(env.sorobanRpcUrl);

// ---------------------------------------------------------------------------
// Current ledger
// ---------------------------------------------------------------------------

export async function getLatestLedger(): Promise<number> {
  const result = await server.getLatestLedger();
  return result.sequence;
}

/**
 * Convert a future Date to a ledger sequence number.
 * Estimate: 5 seconds per ledger.
 */
export async function dateToExpiryLedger(expiryDate: Date): Promise<number> {
  const current = await getLatestLedger();
  const msRemaining = expiryDate.getTime() - Date.now();
  if (msRemaining <= 0) throw new Error('Expiry date must be in the future');
  return current + Math.ceil(msRemaining / 5000);
}

// ---------------------------------------------------------------------------
// Deploy a new campaign escrow contract
// ---------------------------------------------------------------------------

interface DeployParams {
  approvers: string[];
  threshold: number;
  beneficiary: string;
  milestoneAmounts: bigint[];
  expiryLedger: number;
}

/**
 * Build, sign with DEPLOYER_SECRET, submit and return the new contract ID.
 */
export async function deployCampaignEscrow(params: DeployParams): Promise<string> {
  const deployerKeypair = Keypair.fromSecret(env.deployerSecret);
  const deployerAccount = await server.getAccount(deployerKeypair.publicKey());

  const wasmHashBytes = Buffer.from(env.escrowWasmHash, 'hex');

  // Constructor args: approvers, threshold, beneficiary, token, milestones, expiry_ledger
  const constructorArgs = [
    xdr.ScVal.scvVec(params.approvers.map((a) => Address.fromString(a).toScVal())),
    nativeToScVal(params.threshold, { type: 'u32' }),
    Address.fromString(params.beneficiary).toScVal(),
    Address.fromString(env.tokenContractId).toScVal(),
    xdr.ScVal.scvVec(
      params.milestoneAmounts.map((amt) => nativeToScVal(amt, { type: 'i128' })),
    ),
    nativeToScVal(params.expiryLedger, { type: 'u32' }),
  ];

  const deployOp = Operation.invokeContractFunction({
    contract: 'CAARAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPQ4',
    function: 'deploy',
    args: [
      nativeToScVal(wasmHashBytes, { type: 'bytes' }),
      nativeToScVal(Keypair.random().publicKey(), { type: 'address' }), // salt
      xdr.ScVal.scvVec(constructorArgs),
    ],
  });

  const tx = new TransactionBuilder(deployerAccount, {
    fee: BASE_FEE,
    networkPassphrase: env.networkPassphrase,
  })
    .addOperation(deployOp)
    .setTimeout(TimeoutInfinite)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(deployerKeypair);

  const result = await server.sendTransaction(prepared);
  if (result.status === 'ERROR') {
    throw new Error(`Deploy transaction failed: ${JSON.stringify(result.errorResult)}`);
  }

  // Poll for confirmation
  const hash = result.hash;
  let attempts = 0;
  while (attempts < 30) {
    await sleep(2000);
    const txResult = await server.getTransaction(hash);
    if (txResult.status === 'SUCCESS') {
      // Extract contract ID from result metadata
      const contractId = extractDeployedContractId(txResult);
      if (!contractId) throw new Error('Could not extract contract ID from deploy result');
      return contractId;
    }
    if (txResult.status === 'FAILED') {
      throw new Error(`Deploy transaction failed on-chain: ${hash}`);
    }
    attempts++;
  }

  throw new Error(`Deploy transaction not confirmed after 60 seconds: ${hash}`);
}

function extractDeployedContractId(
  txResult: SorobanRpc.Api.GetSuccessfulTransactionResponse,
): string | null {
  try {
    // In stellar-sdk v12+, resultMetaXdr is already a parsed TransactionMeta object
    const meta = txResult.resultMetaXdr;
    let v3;
    try {
      v3 = meta.v3();
    } catch {
      return null;
    }
    for (const op of v3.operations()) {
      for (const change of op.changes()) {
        if (change.switch() === xdr.LedgerEntryChangeType.ledgerEntryCreated()) {
          const entry = change.created().data();
          if (entry.switch() === xdr.LedgerEntryType.contractData()) {
            const contractData = entry.contractData();
            return Address.fromScAddress(contractData.contract()).toString();
          }
        }
      }
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

// ---------------------------------------------------------------------------
// Trustline check
// ---------------------------------------------------------------------------

/**
 * Returns true if the given Stellar address holds a trustline for the configured token.
 */
export async function hasTrustline(stellarAddress: string): Promise<boolean> {
  try {
    const horizon = env.stellarNetwork === 'mainnet'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org';

    const resp = await fetch(
      `${horizon}/accounts/${encodeURIComponent(stellarAddress)}`,
    );
    if (!resp.ok) return false;

    const account = (await resp.json()) as {
      balances: Array<{ asset_code?: string; asset_issuer?: string; asset_type: string }>;
    };

    return account.balances.some(
      (b) =>
        b.asset_code === env.usdcAssetCode && b.asset_issuer === env.usdcIssuer,
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Verify an on-chain transaction
// ---------------------------------------------------------------------------

/**
 * Poll Soroban RPC until the transaction is found, then return its status.
 * Throws if the transaction fails or is not found within the timeout.
 */
export async function verifyTransaction(
  txHash: string,
  maxAttempts = 20,
): Promise<SorobanRpc.Api.GetSuccessfulTransactionResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await server.getTransaction(txHash);
    if (result.status === 'SUCCESS') {
      return result as SorobanRpc.Api.GetSuccessfulTransactionResponse;
    }
    if (result.status === 'FAILED') {
      throw new Error(`Transaction failed on-chain: ${txHash}`);
    }
    // NOT_FOUND or still pending — wait and retry
    await sleep(3000);
  }
  throw new Error(`Transaction not confirmed after ${maxAttempts} attempts: ${txHash}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { server as sorobanServer };
