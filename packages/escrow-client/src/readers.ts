/**
 * Read helpers for antioch-escrow — all reads go through Soroban simulation.
 * Source: https://github.com/eogenyi23-creator/antioch-escrow
 */

import {
  Contract,
  rpc,
  TransactionBuilder,
  Keypair,
  BASE_FEE,
  Address,
  nativeToScVal,
  scValToNative,
  TimeoutInfinite,
  xdr,
} from '@stellar/stellar-sdk';
import type {
  ContractState,
  MilestoneData,
  ReadParams,
  ReadMilestoneParams,
  ReadDonorContributionParams,
  ReadApprovalsParams,
} from './types';

/** Throwaway keypair used as the source for simulation-only transactions. */
const SIM_KEYPAIR = Keypair.random();

async function simulate(
  rpcUrl: string,
  networkPassphrase: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<xdr.ScVal> {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });

  // Use a throwaway account for simulation — no real account needed
  const account = new (await import('@stellar/stellar-sdk')).Account(
    SIM_KEYPAIR.publicKey(),
    '0',
  );

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(TimeoutInfinite)
    .build();

  const result = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(result)) {
    throw new Error(`Simulation error for ${method}: ${result.error}`);
  }

  const successResult = result as rpc.Api.SimulateTransactionSuccessResponse;
  if (!successResult.result) {
    throw new Error(`No result from simulation of ${method}`);
  }

  return successResult.result.retval;
}

/** Read the contract state: Uninitialized | Active | Completed | Expired */
export async function readState(params: ReadParams): Promise<ContractState> {
  const retval = await simulate(
    params.rpcUrl,
    params.networkPassphrase,
    params.contractId,
    'state',
  );
  // State is returned as an enum variant
  const native = scValToNative(retval) as string;
  return native as ContractState;
}

/** Read the total funded amount in stroops */
export async function readFundedTotal(params: ReadParams): Promise<bigint> {
  const retval = await simulate(
    params.rpcUrl,
    params.networkPassphrase,
    params.contractId,
    'funded_total',
  );
  return BigInt(scValToNative(retval) as string | number | bigint);
}

/** Read the total released amount in stroops */
export async function readReleasedTotal(params: ReadParams): Promise<bigint> {
  const retval = await simulate(
    params.rpcUrl,
    params.networkPassphrase,
    params.contractId,
    'released_total',
  );
  return BigInt(scValToNative(retval) as string | number | bigint);
}

/** Read a milestone's amount and release status by index */
export async function readMilestone(params: ReadMilestoneParams): Promise<MilestoneData> {
  const retval = await simulate(
    params.rpcUrl,
    params.networkPassphrase,
    params.contractId,
    'milestone',
    [nativeToScVal(params.index, { type: 'u32' })],
  );
  const native = scValToNative(retval) as [string | number | bigint, boolean];
  return {
    amount: BigInt(native[0]),
    released: native[1],
  };
}

/** Read the number of milestones */
export async function readMilestoneCount(params: ReadParams): Promise<number> {
  const retval = await simulate(
    params.rpcUrl,
    params.networkPassphrase,
    params.contractId,
    'milestone_count',
  );
  return Number(scValToNative(retval));
}

/** Read the number of approvals recorded for a milestone index */
export async function readApprovals(params: ReadApprovalsParams): Promise<number> {
  const retval = await simulate(
    params.rpcUrl,
    params.networkPassphrase,
    params.contractId,
    'approvals',
    [nativeToScVal(params.index, { type: 'u32' })],
  );
  return Number(scValToNative(retval));
}

/** Read a donor's total contribution to the contract in stroops */
export async function readDonorContribution(
  params: ReadDonorContributionParams,
): Promise<bigint> {
  const retval = await simulate(
    params.rpcUrl,
    params.networkPassphrase,
    params.contractId,
    'donor_contribution',
    [Address.fromString(params.donor).toScVal()],
  );
  return BigInt(scValToNative(retval) as string | number | bigint);
}
