/**
 * Unsigned XDR transaction builders for antioch-escrow contract functions.
 * All builders return base64-encoded unsigned XDR strings.
 * Source: https://github.com/eogenyi23-creator/antioch-escrow
 */

import {
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
  nativeToScVal,
  xdr,
  SorobanRpc,
  TimeoutInfinite,
} from '@stellar/stellar-sdk';
import type {
  BuildFundParams,
  BuildApproveMilestoneParams,
  BuildReleaseMilestoneParams,
  BuildRefundParams,
} from './types.js';

/** 3-second timeout for simulation calls */
const SIMULATION_TIMEOUT_MS = 3000;

/**
 * Build an unsigned XDR for fund(donor, amount).
 * Amounts are i128 stroops. i128 values passed inside lists must be strings.
 */
export async function buildFund(params: BuildFundParams): Promise<string> {
  const { rpcUrl, networkPassphrase, contractId, donor, amount } = params;

  const server = new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  const account = await server.getAccount(donor);

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        'fund',
        Address.fromString(donor).toScVal(),
        nativeToScVal(amount, { type: 'i128' }),
      ),
    )
    .setTimeout(TimeoutInfinite)
    .build();

  const prepared = await server.prepareTransaction(tx);
  return prepared.toXDR();
}

/**
 * Build an unsigned XDR for approve_milestone(approver, index).
 */
export async function buildApproveMilestone(
  params: BuildApproveMilestoneParams,
): Promise<string> {
  const { rpcUrl, networkPassphrase, contractId, approver, index } = params;

  const server = new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  const account = await server.getAccount(approver);

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        'approve_milestone',
        Address.fromString(approver).toScVal(),
        nativeToScVal(index, { type: 'u32' }),
      ),
    )
    .setTimeout(TimeoutInfinite)
    .build();

  const prepared = await server.prepareTransaction(tx);
  return prepared.toXDR();
}

/**
 * Build an unsigned XDR for release_milestone(index).
 * Anyone can call this once conditions are met; caller pays the fee.
 */
export async function buildReleaseMilestone(
  params: BuildReleaseMilestoneParams,
): Promise<string> {
  const { rpcUrl, networkPassphrase, contractId, caller, index } = params;

  const server = new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  const account = await server.getAccount(caller);

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        'release_milestone',
        nativeToScVal(index, { type: 'u32' }),
      ),
    )
    .setTimeout(TimeoutInfinite)
    .build();

  const prepared = await server.prepareTransaction(tx);
  return prepared.toXDR();
}

/**
 * Build an unsigned XDR for refund(donor).
 * Only callable after campaign expiry; once per donor.
 */
export async function buildRefund(params: BuildRefundParams): Promise<string> {
  const { rpcUrl, networkPassphrase, contractId, donor } = params;

  const server = new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  const account = await server.getAccount(donor);

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        'refund',
        Address.fromString(donor).toScVal(),
      ),
    )
    .setTimeout(TimeoutInfinite)
    .build();

  const prepared = await server.prepareTransaction(tx);
  return prepared.toXDR();
}
