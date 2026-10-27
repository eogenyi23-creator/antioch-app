/**
 * Types for the antioch-escrow Soroban contract client.
 * Source: https://github.com/eogenyi23-creator/antioch-escrow
 */

export type ContractState = 'Uninitialized' | 'Active' | 'Completed' | 'Expired';

export interface MilestoneData {
  amount: bigint;
  released: boolean;
}

export interface ContractError {
  code: number;
  name: string;
  message: string;
}

export interface BuildParams {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
}

export interface BuildFundParams extends BuildParams {
  donor: string;
  /** Amount in stroops as bigint */
  amount: bigint;
}

export interface BuildApproveMilestoneParams extends BuildParams {
  approver: string;
  index: number;
}

export interface BuildReleaseMilestoneParams extends BuildParams {
  /** Caller's address (anyone can call release once conditions are met) */
  caller: string;
  index: number;
}

export interface BuildRefundParams extends BuildParams {
  donor: string;
}

export interface ReadParams {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
}

export interface ReadMilestoneParams extends ReadParams {
  index: number;
}

export interface ReadDonorContributionParams extends ReadParams {
  donor: string;
}

export interface ReadApprovalsParams extends ReadParams {
  index: number;
}
