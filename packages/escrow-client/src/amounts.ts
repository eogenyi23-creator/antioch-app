/**
 * Amount conversion helpers — strict 7-decimal USDC / stroop math.
 * Never uses floating-point arithmetic.
 * Source: https://github.com/eogenyi23-creator/antioch-escrow
 */

const DECIMALS = 7;
const STROOP_FACTOR = BigInt(10 ** DECIMALS); // 10_000_000n

/**
 * Convert a human-readable USDC string (up to 7 decimal places) to stroops.
 *
 * @throws {RangeError} if the input is not a valid non-negative amount with ≤7 decimals
 */
export function toStroops(amount: string): bigint {
  if (typeof amount !== 'string') {
    throw new RangeError('Amount must be a string');
  }

  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(trimmed)) {
    throw new RangeError(
      `Invalid amount "${amount}": must be a non-negative number with at most 7 decimal places`,
    );
  }

  const [intPart, fracPart = ''] = trimmed.split('.');
  const paddedFrac = fracPart.padEnd(DECIMALS, '0');

  const result = BigInt(intPart) * STROOP_FACTOR + BigInt(paddedFrac);

  if (result < 0n) {
    throw new RangeError('Amount must be non-negative');
  }

  return result;
}

/**
 * Convert a stroop bigint to a human-readable USDC string with exactly 7 decimal places.
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
