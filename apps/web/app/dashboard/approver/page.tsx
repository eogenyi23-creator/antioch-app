/* eslint-disable react-hooks/exhaustive-deps */
'use client';
import { useEffect, useState } from 'react';
import { Nav } from '@/components/Nav';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api';
import { mapApiError } from '@/lib/errors';
import type { CampaignSummary, MilestoneSummary } from '@antioch/shared';

export default function ApproverDashboard() {
  const { user, kit, walletAddress } = useAuth();
  interface EvidenceFile { url: string; name: string; mime: string; }
  interface EvidenceEntry { id: string; notes: string; files?: EvidenceFile[]; }
  interface QueueItem { campaign: CampaignSummary & { approvers: string[] }; milestone: MilestoneSummary & { index: number; title: string; description?: string | null; released: boolean }; evidence: EvidenceEntry[]; }
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const campaigns = await apiFetch<(CampaignSummary & { approvers: string[] })[]>('/campaigns');
      const mine = campaigns.filter((c) => Array.isArray(c.approvers) && c.approvers.includes(user?.address ?? ''));
      const out: QueueItem[] = [];
      for (const c of mine) {
        const ms = await apiFetch<(MilestoneSummary & { index: number; title: string; description?: string | null; released: boolean })[]>(`/campaigns/${c.id}/milestones`);
        for (const m of ms) {
          if (m.released) continue;
          let evidence: EvidenceEntry[] = [];
          try { evidence = await apiFetch<EvidenceEntry[]>(`/campaigns/${c.id}/milestones/${m.index}/evidence`); } catch { /* ignore */ }
          out.push({ campaign: c, milestone: m, evidence });
        }
      }
      setItems(out);
    } catch (e) { setError(mapApiError(e)); } finally { setLoading(false); }
  }

  useEffect(() => { if (user) load(); }, [user]);

  async function approve(item: QueueItem) {
    if (!kit || !walletAddress) return;
    const key = crypto.randomUUID();
    try {
      const initRes = await apiFetch<{ unsignedXdr: string }>(`/campaigns/${item.campaign.id}/milestones/${item.milestone.index}/approve`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key }) });
      const signed = await kit.signTransaction(initRes.unsignedXdr, { networkPassphrase: (await import('@/lib/config')).NETWORK_PASSPHRASE, address: walletAddress });
      const { submitSignedXdr } = await import('@/lib/stellar');
      const txHash = await submitSignedXdr(signed.signedTxXdr);
      await apiFetch(`/campaigns/${item.campaign.id}/milestones/${item.milestone.index}/approve/submit`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key, txHash }) });
      await load();
    } catch (e) { alert(mapApiError(e)); }
  }

  if (!user) return <div><Nav /><main className="p-8">Sign in required.</main></div>;

  return (
    <div><Nav /><main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold">Approver queue</h1>
      {loading && <p>Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}
      <div className="mt-4 space-y-4">
        {items.map((it, i) => (
          <div key={i} className="rounded border p-4">
            <h2 className="font-semibold">{it.campaign.title} — Milestone {it.milestone.index}: {it.milestone.title}</h2>
            <p className="text-sm text-gray-600">{it.milestone.description}</p>
            <p className="text-sm">Amount: {it.milestone.amountStroops} stroops</p>
            {it.evidence.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium">Evidence:</p>
                {it.evidence.map((ev: EvidenceEntry) => (
                  <div key={ev.id} className="mt-1 text-sm">
                    <p>{ev.notes}</p>
                    {ev.files?.map((f: EvidenceFile) => (
                      <a key={f.url} href={f.url} target="_blank" className="text-blue-600 underline block">{f.name}</a>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => approve(it)} className="mt-3 rounded bg-blue-600 px-3 py-1 text-sm text-white focus-ring">Approve</button>
          </div>
        ))}
        {!loading && items.length === 0 && <p className="text-gray-500">No pending milestones.</p>}
      </div>
    </main></div>
  );
}