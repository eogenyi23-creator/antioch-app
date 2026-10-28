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
} from './types';

// XDR builders (return unsigned base64 XDR strings)
export { buildFund } from './builders';
export { buildApproveMilestone } from './builders';
export { buildReleaseMilestone } from './builders';
export { buildRefund } from './builders';

// Read helpers (Soroban simulation)
export { readState } from './readers';
export { readFundedTotal } from './readers';
export { readReleasedTotal } from './readers';
export { readMilestone } from './readers';
export { readMilestoneCount } from './readers';
export { readApprovals } from './readers';
export { readDonorContribution } from './readers';

// Amount utilities
export { toStroops, fromStroops } from './amounts';

// Error decoding
export { decodeError, parseContractErrorCode } from './errors';

// Ledger ↔ date conversion
export {
  getLatestLedger,
  dateToLedger,
  ledgerToDate,
  ledgerToDateSync,
} from './ledger';
