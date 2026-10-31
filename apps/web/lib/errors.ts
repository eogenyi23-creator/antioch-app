export const CONTRACT_ERROR_MESSAGES: Record<number, string> = {
  1: 'Campaign not initialised',
  2: 'Campaign already initialised',
  3: 'You are not authorised for this action',
  4: 'Approval threshold is invalid',
  5: 'Duplicate approver address',
  6: 'Invalid milestone index',
  7: 'Milestone already released',
  8: 'You have already approved this milestone',
  9: 'Contract has insufficient funds',
  10: 'Campaign has expired',
  11: 'Campaign has not yet expired',
  12: 'Nothing to refund for this donor',
  13: 'Amount must be greater than zero',
  14: 'Milestones must be released in order',
  15: 'Arithmetic overflow',
  16: 'Donation would exceed campaign funding cap',
  17: 'Approval threshold not yet reached',
  18: 'Expiry ledger is invalid',
};

export function mapContractError(code: number | undefined, fallback?: string): string {
  if (code !== undefined && CONTRACT_ERROR_MESSAGES[code]) {
    return CONTRACT_ERROR_MESSAGES[code];
  }
  return fallback ?? 'Something went wrong';
}

export function mapApiError(err: unknown): string {
  const e = err as { message?: string; status?: number; code?: string };
  if (e?.message) {
    // Try to extract contract error code
    const match = e.message.match(/Error\(Contract,\s*#(\d+)\)/);
    if (match) {
      const code = parseInt(match[1], 10);
      if (CONTRACT_ERROR_MESSAGES[code]) return CONTRACT_ERROR_MESSAGES[code];
    }
    return e.message;
  }
  return 'Something went wrong';
}