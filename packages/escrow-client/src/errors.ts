/**
 * Contract error code mapping for antioch-escrow.
 * Source: https://github.com/eogenyi23-creator/antioch-escrow
 */

import type { ContractError } from './types.js';

const ERROR_MAP: Record<number, { name: string; message: string }> = {
  1:  { name: 'NotInitialized',       message: 'Campaign not initialised' },
  2:  { name: 'AlreadyInitialized',   message: 'Campaign already initialised' },
  3:  { name: 'Unauthorized',         message: 'You are not authorised for this action' },
  4:  { name: 'InvalidThreshold',     message: 'Approval threshold is invalid' },
  5:  { name: 'DuplicateApprover',    message: 'Duplicate approver address' },
  6:  { name: 'InvalidMilestone',     message: 'Invalid milestone index' },
  7:  { name: 'AlreadyReleased',      message: 'Milestone already released' },
  8:  { name: 'AlreadyApproved',      message: 'You have already approved this milestone' },
  9:  { name: 'InsufficientFunds',    message: 'Contract has insufficient funds' },
  10: { name: 'Expired',              message: 'Campaign has expired' },
  11: { name: 'NotExpired',           message: 'Campaign has not yet expired' },
  12: { name: 'NothingToRefund',      message: 'Nothing to refund for this donor' },
  13: { name: 'AmountMustBePositive', message: 'Amount must be greater than zero' },
  14: { name: 'OutOfOrder',           message: 'Milestones must be released in order' },
  15: { name: 'Overflow',             message: 'Arithmetic overflow' },
  16: { name: 'FundingCapExceeded',   message: 'Donation would exceed campaign funding cap' },
  17: { name: 'ThresholdNotMet',      message: 'Approval threshold not yet reached' },
  18: { name: 'InvalidExpiry',        message: 'Expiry ledger is invalid' },
};

/**
 * Decode a Soroban contract error code into a structured error object.
 * Returns a generic error for unknown codes.
 */
export function decodeError(code: number): ContractError {
  const entry = ERROR_MAP[code];
  if (entry) {
    return { code, name: entry.name, message: entry.message };
  }
  return { code, name: 'UnknownError', message: `Contract error code ${code}` };
}

/**
 * Parse the error code out of a Soroban simulation/invocation error string.
 * Returns undefined if no numeric contract error code is found.
 */
export function parseContractErrorCode(errorStr: string): number | undefined {
  // Soroban SDK surfaces contract errors as "Error(Contract, #N)" or similar
  const match = errorStr.match(/Error\(Contract,\s*#(\d+)\)/);
  if (match) return parseInt(match[1], 10);
  // Fallback: plain numeric string in error message
  const fallback = errorStr.match(/\bcode[:\s]+(\d+)/i);
  if (fallback) return parseInt(fallback[1], 10);
  return undefined;
}
