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
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Operation,
  Address,
  nativeToScVal,
  scValToNative,
  TimeoutInfinite,
} from '@stellar/stellar-sdk';
import { env } from '../config/env.js';

const server = new rpc.Server(env.sorobanRpcUrl);

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
 *
 * Uses Operation.createCustomContract (CAP-0072 CREATE_CONTRACT_V2) which
 * passes constructor arguments atomically in the same operation, so no
 * separate __constructor call is needed.
 *
 * Constructor argument order matches the contract spec:
 *   approvers (Vec<Address>), threshold (u32), beneficiary (Address),
 *   token (Address), milestones (Vec<i128>), expiry_ledger (u32)
 *
 * The new contract ID is read from the transaction's return value, not by
 * scanning ledger changes.
 */
export async function deployCampaignEscrow(params: DeployParams): Promise<string> {
  const deployerKeypair = Keypair.fromSecret(env.deployerSecret);
  const deployerAccount = await server.getAccount(deployerKeypair.publicKey());

  const wasmHash = Buffer.from(env.escrowWasmHash, 'hex');

  // Constructor args in spec order:
  //   approvers (Vec<Address>), threshold (u32), beneficiary (Address),
  //   token (Address), milestones (Vec<i128>), expiry_ledger (u32)
  const constructorArgs = [
    nativeToScVal(params.approvers.map((a) => new Address(a))),
    nativeToScVal(params.threshold, { type: 'u32' }),
    new Address(params.beneficiary).toScVal(),
    new Address(env.tokenContractId).toScVal(),
    nativeToScVal(params.milestoneAmounts.map((amt) => nativeToScVal(amt, { type: 'i128' }))),
    nativeToScVal(params.expiryLedger, { type: 'u32' }),
  ];

  const deployOp = Operation.createCustomContract({
    address: new Address(deployerKeypair.publicKey()),
    wasmHash,
    salt: crypto.getRandomValues(new Uint8Array(32)),
    constructorArgs,
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
      // The return value of CREATE_CONTRACT_V2 is the new contract's Address
      const contractId = extractContractIdFromReturn(txResult);
      if (!contractId) throw new Error('Could not extract contract ID from deploy result');
      return contractId;
    }
    if (txResult.status === 'FAILED') {
      throw new Error(`Deploy transaction failed on-chain: ${hash}`);
    }
    // NOT_FOUND or DUPLICATE — keep polling
    attempts++;
  }

  throw new Error(`Deploy transaction not confirmed after 60 seconds: ${hash}`);
}

/**
 * Extract the new contract ID from the transaction return value.
 *
 * CREATE_CONTRACT_V2 returns the deployed contract address as an ScVal
 * of type scvAddress. The SDK parses this into `txResult.returnValue`.
 */
function extractContractIdFromReturn(
  txResult: rpc.Api.GetSuccessfulTransactionResponse,
): string | null {
  try {
    const retval = txResult.returnValue;
    if (!retval) return null;
    // scValToNative converts an scvAddress to its strkey string
    const native = scValToNative(retval);
    if (typeof native === 'string' && native.startsWith('C')) {
      return native;
    }
    // Fallback: try Address.fromScVal directly
    return Address.fromScVal(retval).toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Trustline check
// ---------------------------------------------------------------------------

/**
 * Returns true if the given Stellar address holds a trustline for the configured token.
 */
export async function hasTrustline(stellarAddress: string): Promise<boolean> {
  try {
    const horizon =
      env.stellarNetwork === 'mainnet'
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
      (b) => b.asset_code === env.usdcAssetCode && b.asset_issuer === env.usdcIssuer,
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
): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await server.getTransaction(txHash);
    if (result.status === 'SUCCESS') {
      return result as rpc.Api.GetSuccessfulTransactionResponse;
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
