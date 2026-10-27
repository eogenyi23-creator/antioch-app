/**
 * @antioch/escrow-client
 *
 * XDR builders and read helpers for the antioch-escrow Soroban contract.
 * Source: https://github.com/eogenyi23-creator/antioch-escrow
 *
 * Not published to npm — copy from the source repo.
 * See README.md for sync instructions.
 */

// Types
export type {
  ContractState,
  MilestoneData,
  ContractError,
  BuildParams,
  BuildFundParams,
  BuildApproveMilestoneParams,
  BuildReleaseMilestoneParams,
  BuildRefundParams,
  ReadParams,
  ReadMilestoneParams,
  ReadDonorContributionParams,
  ReadApprovalsParams,
} from './types.js';

// XDR builders (return unsigned base64 XDR strings)
export { buildFund } from './builders.js';
export { buildApproveMilestone } from './builders.js';
export { buildReleaseMilestone } from './builders.js';
export { buildRefund } from './builders.js';

// Read helpers (Soroban simulation)
export { readState } from './readers.js';
export { readFundedTotal } from './readers.js';
export { readReleasedTotal } from './readers.js';
export { readMilestone } from './readers.js';
export { readMilestoneCount } from './readers.js';
export { readApprovals } from './readers.js';
export { readDonorContribution } from './readers.js';

// Amount utilities
export { toStroops, fromStroops } from './amounts.js';

// Error decoding
export { decodeError, parseContractErrorCode } from './errors.js';

// Ledger ↔ date conversion
export {
  getLatestLedger,
  dateToLedger,
  ledgerToDate,
  ledgerToDateSync,
} from './ledger.js';
