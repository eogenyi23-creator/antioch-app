'use client';
import { useEffect, useState } from 'react';
import { Nav } from '@/components/Nav';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api';
import { fromStroops } from '@antioch/shared';
import type { DonationSummary, CampaignSummary } from '@antioch/shared';
import { mapApiError } from '@/lib/errors';

interface DonationRow extends DonationSummary {
  campaignTitle?: string | null;
  amountUsdc?: string;
  confirmedAt?: string | null;
}
interface Receipt {
  id: string;
  campaignTitle?: string | null;
  amountUsdc: string;
  amountStroops: string;
  txHash: string | null;
  status: string;
  donorAddress: string;
  createdAt: string;
  confirmedAt?: string | null;
}

export default function DonorDashboard() {
  const { user, kit, walletAddress } = useAuth();
  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [ds, cs] = await Promise.all([apiFetch<DonationRow[]>('/me/donations'), apiFetch<CampaignSummary[]>('/campaigns')]);
      setDonations(ds);
      setCampaigns(cs);
    } catch (e) { setError(mapApiError(e)); } finally { setLoading(false); }
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function viewReceipt(id: string) {
    try {
      const r = await apiFetch<{ receipt: Receipt }>(`/me/donations/${id}/receipt`);
      setReceipt(r.receipt);
    } catch (e) { alert(mapApiError(e)); }
  }

  async function exportCsv() {
    const csv = await apiFetch<string>('/me/donations/export');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'donations.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function refund(campaignId: string) {
    if (!kit || !walletAddress) return;
    try {
      const initRes = await apiFetch<{ unsignedXdr: string; estimatedRefundStroops: string }>(`/campaigns/${campaignId}/refund/init`, { method: 'POST' });
      const signed = await kit.signTransaction(initRes.unsignedXdr, { networkPassphrase: (await import('@/lib/config')).NETWORK_PASSPHRASE, address: walletAddress });
      const { submitSignedXdr } = await import('@/lib/stellar');
      const txHash = await submitSignedXdr(signed.signedTxXdr);
      await apiFetch(`/campaigns/${campaignId}/refund/submit`, { method: 'POST', body: JSON.stringify({ txHash }) });
      alert('Refund submitted');
      await load();
    } catch (e) { alert(mapApiError(e)); }
  }

  const campaignById = (id: string) => campaigns.find((c) => c.id === id);

  if (!user) return <div><Nav /><main className="p-8">Sign in required.</main></div>;

  return (
    <div><Nav /><main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Donor dashboard</h1>
        <button onClick={exportCsv} className="rounded border px-3 py-1 focus-ring">Export CSV</button>
      </div>
      {loading && <p className="mt-4">Loading…</p>}
      {error && <p className="mt-4 text-red-600">{error}</p>}
      <table className="mt-4 w-full text-sm">
        <thead><tr className="text-left"><th>Campaign</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {donations.map((d) => {
            const c = campaignById(d.campaignId);
            const expired = c?.status === 'expired';
            return (
              <tr key={d.id} className="border-t">
                <td className="py-2">{d.campaignTitle ?? d.campaignId}</td>
                <td>{fromStroops(BigInt(d.amountStroops))} USDC</td>
                <td>{d.status}</td>
                <td className="space-x-2">
                  <button onClick={() => viewReceipt(d.id)} className="text-blue-600 underline">Receipt</button>
                  {expired && <button onClick={() => refund(d.campaignId)} className="text-blue-600 underline">Refund</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {receipt && (
        <div className="mt-6 rounded border p-4">
          <h2 className="font-semibold">Receipt</h2>
          <pre className="mt-2 text-xs">{JSON.stringify(receipt, null, 2)}</pre>
        </div>
      )}
    </main></div>
  );
}