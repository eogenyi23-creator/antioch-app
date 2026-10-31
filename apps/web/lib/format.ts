import { fromStroops } from '@antioch/shared';

export function formatUsdc(stroops: string | bigint): string {
  const b = typeof stroops === 'string' ? BigInt(stroops) : stroops;
  return fromStroops(b);
}

export function formatAmountInput(stroops: bigint): string {
  return fromStroops(stroops);
}

export function estimatedExpiryDate(currentLedger: number, expiryLedger: number): Date {
  const ledgersRemaining = expiryLedger - currentLedger;
  const secondsRemaining = ledgersRemaining * 5;
  return new Date(Date.now() + secondsRemaining * 1000);
}

export function explorerTxUrl(txHash: string): string {
  const base = process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://stellar.expert/explorer/testnet';
  return `${base}/tx/${txHash}`;
}

export function explorerContractUrl(contractId: string): string {
  const base = process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://stellar.expert/explorer/testnet';
  return `${base}/contract/${contractId}`;
}