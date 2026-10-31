/* eslint-disable react-hooks/exhaustive-deps */
'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Nav } from '@/components/Nav';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api';
import { formatUsdc, estimatedExpiryDate, explorerTxUrl, explorerContractUrl } from '@/lib/format';
import { mapApiError } from '@/lib/errors';
import { getLatestLedger } from '@antioch/escrow-client';
import { RPC_URL } from '@/lib/config';
import { FundingWidget } from '@/components/FundingWidget';
import { MilestoneTimeline, type MilestoneItem } from '@/components/MilestoneTimeline';

interface Milestone { id: string; index: number; title: string; description?: string | null; amountStroops: string; released: boolean; onChain?: { released: boolean; approvalCount: number; threshold: number } | null; }
interface Campaign { id: string; title: string; story: string; goalStroops: string; beneficiary: string; approvers: string[]; threshold: number; contractId?: string | null; expiryLedger?: number | null; status: string; onChain?: { state: string; fundedTotal: string; releasedTotal: string; remainingCap: string } | null; }
interface Transparency { campaign: Campaign; milestones: Milestone[]; donations: { id: string; amountStroops: string; txHash: string | null; status: string; createdAt: string }[]; approvals: { id: string; milestoneIndex: number; txHash: string | null; createdAt: string }[]; releases?: { milestoneIndex: number; txHash: string | null; amountStroops?: string }[]; }
export default function CampaignDetailPage() {
  const params = useParams(); const id = params?.id as string;
  const { user, kit, walletAddress, connectWallet, signIn } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'transparency'>('overview');
  const [transparency, setTransparency] = useState<Transparency | null>(null);
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [approvedByMe, setApprovedByMe] = useState<Set<number>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() { setLoading(true); setError(null); try { const c = await apiFetch<Campaign>(`/campaigns/${id}`); setCampaign(c); const ms = await apiFetch<Milestone[]>(`/campaigns/${id}/milestones`); setMilestones(ms); if (c.expiryLedger) { try { const cl = await getLatestLedger(RPC_URL); setExpiryDate(estimatedExpiryDate(cl, c.expiryLedger)); } catch { /* ignore */ } } } catch (e) { setError(mapApiError(e)); } finally { setLoading(false); } }
  useEffect(() => { if (id) load(); }, [id]);
  async function loadTransparency() { try { const t = await apiFetch<Transparency>(`/campaigns/${id}/transparency`); setTransparency(t); } catch (e) { setError(mapApiError(e)); } }
  useEffect(() => { if (tab === 'transparency' && !transparency) loadTransparency(); }, [tab]);

  const fundedTotal = campaign?.onChain ? BigInt(campaign.onChain.fundedTotal) : 0n;
  const totalCap = milestones.reduce((s, m) => s + BigInt(m.amountStroops), 0n);
  const remainingCap = campaign?.onChain?.remainingCap ? BigInt(campaign.onChain.remainingCap) : totalCap - fundedTotal;

  async function handleApprove(milestoneIndex: number) {
    if (!campaign || !kit || !walletAddress || !user) return;
    setActionError(null);
    const key = crypto.randomUUID();
    try {
      const initRes = await apiFetch<{ unsignedXdr: string }>(`/campaigns/${id}/milestones/${milestoneIndex}/approve`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key }) });
      const signed = await kit.signTransaction(initRes.unsignedXdr, { networkPassphrase: (await import('@/lib/config')).NETWORK_PASSPHRASE, address: walletAddress });
      const { submitSignedXdr } = await import('@/lib/stellar');
      const txHash = await submitSignedXdr(signed.signedTxXdr);
      await apiFetch(`/campaigns/${id}/milestones/${milestoneIndex}/approve/submit`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key, txHash }) });
      setApprovedByMe((prev) => new Set(prev).add(milestoneIndex)); await load();
    } catch (e) { setActionError(mapApiError(e)); }
  }
  async function handleRelease(milestoneIndex: number) {
    if (!campaign || !kit || !walletAddress) return;
    setActionError(null);
    const key = crypto.randomUUID();
    try {
      const initRes = await apiFetch<{ unsignedXdr: string }>(`/campaigns/${id}/milestones/${milestoneIndex}/release`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key }) });
      const signed = await kit.signTransaction(initRes.unsignedXdr, { networkPassphrase: (await import('@/lib/config')).NETWORK_PASSPHRASE, address: walletAddress });
      const { submitSignedXdr } = await import('@/lib/stellar');
      const txHash = await submitSignedXdr(signed.signedTxXdr);
      await apiFetch(`/campaigns/${id}/milestones/${milestoneIndex}/release/submit`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key, txHash }) });
      await load();
    } catch (e) { setActionError(mapApiError(e)); }
  }

  if (loading) return <div><Nav /><main className="p-8">Loading…</main></div>;
  if (error || !campaign) return <div><Nav /><main className="p-8 text-red-600">{error ?? 'Not found'}</main></div>;
  return (
    <div><Nav /><main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold">{campaign.title}</h1>
      <p className="mt-2 text-gray-700">{campaign.story}</p>
      <div className="mt-2 text-sm text-gray-500">Beneficiary: {campaign.beneficiary} · Status: {campaign.status} · Threshold: {campaign.threshold} of {campaign.approvers.length}</div>
      {campaign.contractId && (<div className="mt-1 text-sm"><a href={explorerContractUrl(campaign.contractId)} target="_blank" className="text-blue-600 hover:underline">View contract on explorer</a></div>)}
      {expiryDate && (<div className="mt-1 text-sm text-gray-500" title="Approximate: about 5 seconds per ledger">Estimated expiry: {expiryDate.toLocaleDateString()} (approx.)</div>)}
      <div className="mt-4 flex gap-2 border-b">
        <button onClick={() => setTab('overview')} className={`px-3 py-2 ${tab === 'overview' ? 'border-b-2 border-blue-600' : ''}`}>Overview</button>
        <button onClick={() => setTab('transparency')} className={`px-3 py-2 ${tab === 'transparency' ? 'border-b-2 border-blue-600' : ''}`}>Transparency</button>
      </div>
      {actionError && <p role="alert" className="mt-4 text-sm text-red-600" data-testid="action-error">{actionError}</p>}
      {tab === 'overview' && (<>
        <section className="mt-6 rounded border p-4">
          <h2 className="text-lg font-semibold">Funding</h2>
          <div className="mt-2 h-3 w-full rounded bg-gray-200"><div className="h-3 rounded bg-blue-600" style={{ width: `${totalCap > 0n ? Math.min(100, Number((fundedTotal * 100n) / totalCap)) : 0}%` }} /></div>
          <div className="mt-2 flex justify-between text-sm"><span>Funded: {formatUsdc(fundedTotal.toString())} USDC</span><span>Cap: {formatUsdc(totalCap.toString())} USDC</span></div>
        </section>
        <FundingWidget campaignId={id} remainingCap={remainingCap} status={campaign.status} kit={kit} walletAddress={walletAddress} user={user} connectWallet={connectWallet} signIn={signIn} onDonated={load} />
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Milestones</h2>
          <MilestoneTimeline milestones={milestones as unknown as MilestoneItem[]} campaign={campaign} user={user} approvedByMe={approvedByMe} onApprove={handleApprove} onRelease={handleRelease} />
        </section>
      </>)}
      {tab === 'transparency' && (<section className="mt-6">{!transparency && <p>Loading…</p>}{transparency && (<div className="space-y-4"><h2 className="text-lg font-semibold">Funds in (donations)</h2><ul className="space-y-1 text-sm">{transparency.donations.map((d) => (<li key={d.id}>{formatUsdc(d.amountStroops)} USDC — {d.status}{d.txHash && (<> <a href={explorerTxUrl(d.txHash)} target="_blank" className="text-blue-600 underline">tx</a></>)}</li>))}{transparency.donations.length === 0 && <li className="text-gray-500">No donations yet.</li>}</ul><h2 className="text-lg font-semibold">Approvals</h2><ul className="space-y-1 text-sm">{transparency.approvals.map((a) => (<li key={a.id}>Milestone {a.milestoneIndex}{a.txHash && (<> <a href={explorerTxUrl(a.txHash)} target="_blank" className="text-blue-600 underline">tx</a></>)}</li>))}{transparency.approvals.length === 0 && <li className="text-gray-500">No approvals yet.</li>}</ul><h2 className="text-lg font-semibold">Releases</h2><ul className="space-y-1 text-sm">{transparency.releases && transparency.releases.length > 0 ? transparency.releases.map((r, i) => (<li key={r.txHash ?? i}>Milestone {r.milestoneIndex}{r.txHash && (<> <a href={explorerTxUrl(r.txHash)} target="_blank" className="text-blue-600 underline">tx</a></>)}</li>)) : transparency.milestones.filter((m) => m.released).map((m) => (<li key={m.id}>Milestone {m.index}: {formatUsdc(m.amountStroops)} USDC released</li>))}{transparency.milestones.filter((m) => m.released).length === 0 && !(transparency.releases && transparency.releases.length) && <li className="text-gray-500">No releases yet.</li>}</ul></div>)}</section>)}</main></div>
  );
}
