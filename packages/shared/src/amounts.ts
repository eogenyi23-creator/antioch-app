/**
 * Amount helpers — strict 7-decimal USDC / stroop math.
 *
 * These are standalone implementations (not re-exported from escrow-client)
 * so that packages/shared has no dependency on @stellar/stellar-sdk.
 * The logic is identical to packages/escrow-client/src/amounts.ts.
 */

const DECIMALS = 7;
const STROOP_FACTOR = BigInt(10 ** DECIMALS); // 10_000_000n

/**
 * Convert a human-readable USDC string (up to 7 decimal places) to stroops.
 *
 * @throws {RangeError} for invalid, negative, or >7 decimal-place input
 */
export function toStroops(amount: string): bigint {
  if (typeof amount !== 'string') {
    throw new RangeError('Amount must be a string');
  }

  const trimmed = amount.trim();
  if (trimmed === '' || !/^\d+(\.\d{1,7})?$/.test(trimmed)) {
    throw new RangeError(
      `Invalid amount "${amount}": must be a non-negative number with at most 7 decimal places`,
    );
  }

  const [intPart, fracPart = ''] = trimmed.split('.');
  const paddedFrac = fracPart.padEnd(DECIMALS, '0');

  return BigInt(intPart) * STROOP_FACTOR + BigInt(paddedFrac);
}

/**
 * Convert stroops (bigint) to a human-readable USDC string with exactly 7 decimal places.
 *
 * @throws {RangeError} if stroops is negative
 */
export function fromStroops(stroops: bigint): string {
  if (stroops < 0n) {
    throw new RangeError('Stroops must be non-negative');
  }

  const intPart = stroops / STROOP_FACTOR;
  const fracPart = stroops % STROOP_FACTOR;
  const fracStr = fracPart.toString().padStart(DECIMALS, '0');

  return `${intPart}.${fracStr}`;
}

/**
 * Parse a stroop value from an untrusted string (e.g., from JSON).
 * Throws if the string is not a valid non-negative integer.
 */
export function parseStroops(value: string): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    throw new RangeError(`Invalid stroop value: "${value}"`);
  }
  return BigInt(value.trim());
}
