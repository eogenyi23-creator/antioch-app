'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toStroops } from '@antioch/shared';
import { formatUsdc } from '@/lib/format';
import { mapApiError } from '@/lib/errors';
import type { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';

type DonateState = 'idle' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error';

export function FundingWidget({
  campaignId,
  remainingCap,
  status,
  kit,
  walletAddress,
  onDonated,
}: {
  campaignId: string;
  remainingCap: bigint;
  status: string;
  kit: StellarWalletsKit | null;
  walletAddress: string | null;
  onDonated?: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [donateState, setDonateState] = useState<DonateState>('idle');
  const [donateError, setDonateError] = useState<string | null>(null);
  const [donateTx, setDonateTx] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const amountStroops = (() => {
    try { return amount ? toStroops(amount) : 0n; } catch { return null; }
  })();
  const overCap = amountStroops !== null && amountStroops > remainingCap;

  async function handleDonate() {
    if (!kit || !walletAddress) return;
    if (amountStroops === null || amountStroops <= 0n) { setDonateError('Enter a valid amount'); return; }
    if (overCap) { setDonateError('Amount exceeds remaining fundable cap'); return; }
    const key = idempotencyKey ?? crypto.randomUUID();
    setIdempotencyKey(key); setDonateError(null); setDonateState('signing');
    try {
      const initRes = await apiFetch<{ unsignedXdr: string }>(`/campaigns/${campaignId}/donations/init`, {
        method: 'POST', body: JSON.stringify({ idempotencyKey: key, amount }),
      });
      const signed = await kit.signTransaction(initRes.unsignedXdr, {
        networkPassphrase: (await import('@/lib/config')).NETWORK_PASSPHRASE,
        address: walletAddress,
      });
      setDonateState('submitting');
      const { submitSignedXdr } = await import('@/lib/stellar');
      const txHash = await submitSignedXdr(signed.signedTxXdr);
      setDonateState('confirming');
      await apiFetch(`/campaigns/${campaignId}/donations/submit`, {
        method: 'POST', body: JSON.stringify({ idempotencyKey: key, txHash }),
      });
      setDonateTx(txHash); setDonateState('success'); setIdempotencyKey(null);
      onDonated?.();
    } catch (e) {
      setDonateError(mapApiError(e));
      setDonateState('error');
    }
  }

  return (
    <section className="mt-6 rounded border p-4" data-testid="funding-widget">
      <h2 className="text-lg font-semibold">Funding</h2>
      <p className="mt-1 text-sm text-gray-600">Remaining fundable: {formatUsdc(remainingCap.toString())} USDC</p>
      {status === 'active' && (
        <div className="mt-4">
          {!walletAddress ? (
            <button className="rounded bg-blue-600 px-3 py-1 text-white focus-ring" disabled>Connect wallet</button>
          ) : (
            <>
              <label className="block text-sm font-medium" htmlFor="amount">Amount (USDC)</label>
              <input id="amount" type="text" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" aria-label="Donation amount" />
              {overCap && <p className="mt-1 text-sm text-red-600" data-testid="over-cap">Amount exceeds remaining fundable cap.</p>}
              <button onClick={handleDonate} disabled={donateState === 'signing' || donateState === 'submitting' || donateState === 'confirming' || overCap} className="mt-3 rounded bg-blue-600 px-4 py-2 text-white focus-ring disabled:opacity-50">
                {donateState === 'idle' || donateState === 'error' ? 'Donate' : donateState === 'signing' ? 'Waiting for wallet signature…' : donateState === 'submitting' ? 'Submitting…' : donateState === 'confirming' ? 'Confirming…' : 'Donate'}
              </button>
              {donateState === 'success' && donateTx && <p className="mt-2 text-sm text-green-700" data-testid="success">Success!</p>}
              {donateError && <p className="mt-2 text-sm text-red-600" data-testid="error">{donateError}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}