/* eslint-disable react-hooks/exhaustive-deps */
'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Nav } from '@/components/Nav';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api';
import { toStroops } from '@antioch/shared';
import { formatUsdc, estimatedExpiryDate, explorerTxUrl, explorerContractUrl } from '@/lib/format';
import { mapApiError } from '@/lib/errors';
import { getLatestLedger } from '@antioch/escrow-client';
import { RPC_URL } from '@/lib/config';
interface Milestone { id: string; index: number; title: string; description?: string | null; amountStroops: string; released: boolean; onChain?: { released: boolean; approvalCount: number; threshold: number } | null; }
interface Campaign { id: string; title: string; story: string; goalStroops: string; beneficiary: string; approvers: string[]; threshold: number; contractId?: string | null; expiryLedger?: number | null; status: string; onChain?: { state: string; fundedTotal: string; releasedTotal: string; remainingCap: string } | null; }
interface Transparency { campaign: Campaign; milestones: Milestone[]; donations: { id: string; amountStroops: string; txHash: string | null; status: string; createdAt: string }[]; approvals: { id: string; milestoneIndex: number; txHash: string | null; createdAt: string }[]; }
type DonateState = 'idle' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error';
export default function CampaignDetailPage() {
  const params = useParams(); const id = params?.id as string;
  const { user, kit, walletAddress } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'transparency'>('overview');
  const [transparency, setTransparency] = useState<Transparency | null>(null);
  const [amount, setAmount] = useState('');
  const [donateState, setDonateState] = useState<DonateState>('idle');
  const [donateError, setDonateError] = useState<string | null>(null);
  const [donateTx, setDonateTx] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [approvedByMe, setApprovedByMe] = useState<Set<number>>(new Set());
  async function load() { setLoading(true); setError(null); try { const c = await apiFetch<Campaign>(`/campaigns/${id}`); setCampaign(c); const ms = await apiFetch<Milestone[]>(`/campaigns/${id}/milestones`); setMilestones(ms); if (c.expiryLedger) { try { const cl = await getLatestLedger(RPC_URL); setExpiryDate(estimatedExpiryDate(cl, c.expiryLedger)); } catch { /* ignore */ } } } catch (e) { setError(mapApiError(e)); } finally { setLoading(false); } }
  useEffect(() => { if (id) load(); }, [id]);
  async function loadTransparency() { try { const t = await apiFetch<Transparency>(`/campaigns/${id}/transparency`); setTransparency(t); } catch (e) { setError(mapApiError(e)); } }
  useEffect(() => { if (tab === 'transparency' && !transparency) loadTransparency(); }, [tab]);
  const fundedTotal = campaign?.onChain ? BigInt(campaign.onChain.fundedTotal) : 0n;
  const totalCap = milestones.reduce((s, m) => s + BigInt(m.amountStroops), 0n);
  const remainingCap = campaign?.onChain?.remainingCap ? BigInt(campaign.onChain.remainingCap) : totalCap - fundedTotal;
  const amountStroops = (() => { try { return amount ? toStroops(amount) : 0n; } catch { return null; } })();
  const overCap = amountStroops !== null && amountStroops > remainingCap;
  async function handleDonate() {
    if (!campaign || !kit || !walletAddress) return;
    if (amountStroops === null || amountStroops <= 0n) { setDonateError('Enter a valid amount'); return; }
    if (overCap) { setDonateError('Amount exceeds remaining fundable cap'); return; }
    const key = idempotencyKey ?? crypto.randomUUID();
    setIdempotencyKey(key); setDonateError(null); setDonateState('signing');
    try {
      const initRes = await apiFetch<{ donationId: string; unsignedXdr: string; remainingCapStroops: string }>(`/campaigns/${id}/donations/init`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key, amount }) });
      const signed = await kit.signTransaction(initRes.unsignedXdr, { networkPassphrase: (await import('@/lib/config')).NETWORK_PASSPHRASE, address: walletAddress });
      setDonateState('submitting');
      const { submitSignedXdr } = await import('@/lib/stellar');
      const txHash = await submitSignedXdr(signed.signedTxXdr);
      setDonateState('confirming');
      await apiFetch(`/campaigns/${id}/donations/submit`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key, txHash }) });
      setDonateTx(txHash); setDonateState('success'); setIdempotencyKey(null); await load();
    } catch (e) { setDonateError(mapApiError(e)); setDonateState('error'); }
  }
  async function handleApprove(milestoneIndex: number) {
    if (!campaign || !kit || !walletAddress || !user) return;
    const key = crypto.randomUUID();
    try {
      const initRes = await apiFetch<{ unsignedXdr: string }>(`/campaigns/${id}/milestones/${milestoneIndex}/approve`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key }) });
      const signed = await kit.signTransaction(initRes.unsignedXdr, { networkPassphrase: (await import('@/lib/config')).NETWORK_PASSPHRASE, address: walletAddress });
      const { submitSignedXdr } = await import('@/lib/stellar');
      const txHash = await submitSignedXdr(signed.signedTxXdr);
      await apiFetch(`/campaigns/${id}/milestones/${milestoneIndex}/approve/submit`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key, txHash }) });
      setApprovedByMe((prev) => new Set(prev).add(milestoneIndex)); await load();
    } catch (e) { alert(mapApiError(e)); }
  }
  async function handleRelease(milestoneIndex: number) {
    if (!campaign || !kit || !walletAddress) return;
    const key = crypto.randomUUID();
    try {
      const initRes = await apiFetch<{ unsignedXdr: string }>(`/campaigns/${id}/milestones/${milestoneIndex}/release`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key }) });
      const signed = await kit.signTransaction(initRes.unsignedXdr, { networkPassphrase: (await import('@/lib/config')).NETWORK_PASSPHRASE, address: walletAddress });
      const { submitSignedXdr } = await import('@/lib/stellar');
      const txHash = await submitSignedXdr(signed.signedTxXdr);
      await apiFetch(`/campaigns/${id}/milestones/${milestoneIndex}/release/submit`, { method: 'POST', body: JSON.stringify({ idempotencyKey: key, txHash }) });
      await load();
    } catch (e) { alert(mapApiError(e)); }
  }
  if (loading) return <div><Nav /><main className="p-8">Loading…</main></div>;
  if (error || !campaign) return <div><Nav /><main className="p-8 text-red-600">{error ?? 'Not found'}</main></div>;
  const isApprover = !!user && (campaign.approvers.includes(user.address) || user.role === 'admin');
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
      {tab === 'overview' && (<>
        <section className="mt-6 rounded border p-4">
          <h2 className="text-lg font-semibold">Funding</h2>
          <div className="mt-2 h-3 w-full rounded bg-gray-200"><div className="h-3 rounded bg-blue-600" style={{ width: `${totalCap > 0n ? Math.min(100, Number((fundedTotal * 100n) / totalCap)) : 0}%` }} /></div>
          <div className="mt-2 flex justify-between text-sm"><span>Funded: {formatUsdc(fundedTotal.toString())} USDC</span><span>Cap: {formatUsdc(totalCap.toString())} USDC</span></div>
          <p className="mt-1 text-sm text-gray-600">Remaining fundable: {formatUsdc(remainingCap.toString())} USDC</p>
          {campaign.status === 'active' && (<div className="mt-4">
            {!walletAddress ? (<button className="rounded bg-blue-600 px-3 py-1 text-white focus-ring" disabled>Connect wallet (use navbar)</button>) : (<>
              <label className="block text-sm font-medium" htmlFor="amount">Amount (USDC)</label>
              <input id="amount" type="text" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" aria-label="Donation amount" />
              {overCap && (<p className="mt-1 text-sm text-red-600">Amount exceeds remaining fundable cap.</p>)}
              <button onClick={handleDonate} disabled={donateState === 'signing' || donateState === 'submitting' || donateState === 'confirming' || overCap} className="mt-3 rounded bg-blue-600 px-4 py-2 text-white focus-ring disabled:opacity-50">{donateState === 'idle' || donateState === 'error' ? 'Donate' : donateState === 'signing' ? 'Waiting for wallet signature…' : donateState === 'submitting' ? 'Submitting…' : donateState === 'confirming' ? 'Confirming…' : 'Donate'}</button>
              {donateState === 'success' && donateTx && (<p className="mt-2 text-sm text-green-700">Success! <a href={explorerTxUrl(donateTx)} target="_blank" className="underline">View transaction</a></p>)}
              {donateError && <p className="mt-2 text-sm text-red-600">{donateError}</p>}
            </>)}
          </div>)}
        </section>
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Milestones</h2>
          <ol className="mt-3 space-y-3">
            {milestones.map((m) => {
              const onChain = m.onChain; const released = onChain?.released ?? m.released; const approvals = onChain?.approvalCount ?? 0; const threshold = onChain?.threshold ?? campaign.threshold; const thresholdMet = approvals >= threshold; const releasable = thresholdMet && !released; const canApprove = isApprover && !approvedByMe.has(m.index) && !released;
              return (<li key={m.id} className="rounded border p-4"><div className="flex items-start justify-between"><div><h3 className="font-semibold">{m.title}</h3>{m.description && <p className="text-sm text-gray-600">{m.description}</p>}<p className="mt-1 text-sm">Amount: {formatUsdc(m.amountStroops)} USDC</p><p className="text-sm">Status: {released ? 'Released' : thresholdMet ? 'Threshold met' : 'Pending'}</p><p className="text-sm">Approvals: {approvals} / {threshold}</p></div><div className="flex flex-col gap-2">{canApprove && (<button onClick={() => handleApprove(m.index)} className="rounded bg-blue-600 px-3 py-1 text-sm text-white focus-ring">Approve</button>)}{releasable && user && (<button onClick={() => handleRelease(m.index)} className="rounded border px-3 py-1 text-sm focus-ring">Release now</button>)}</div></div></li>);
            })}
          </ol>
        </section>
      </>)}
      {tab === 'transparency' && (<section className="mt-6">{!transparency && <p>Loading…</p>}{transparency && (<div className="space-y-4"><h2 className="text-lg font-semibold">Funds in (donations)</h2><ul className="space-y-1 text-sm">{transparency.donations.map((d) => (<li key={d.id}>{formatUsdc(d.amountStroops)} USDC — {d.status}{d.txHash && (<> <a href={explorerTxUrl(d.txHash)} target="_blank" className="text-blue-600 underline">tx</a></>)}</li>))}{transparency.donations.length === 0 && <li className="text-gray-500">No donations yet.</li>}</ul><h2 className="text-lg font-semibold">Approvals</h2><ul className="space-y-1 text-sm">{transparency.approvals.map((a) => (<li key={a.id}>Milestone {a.milestoneIndex}{a.txHash && (<> <a href={explorerTxUrl(a.txHash)} target="_blank" className="text-blue-600 underline">tx</a></>)}</li>))}{transparency.approvals.length === 0 && <li className="text-gray-500">No approvals yet.</li>}</ul><h2 className="text-lg font-semibold">Releases</h2><ul className="space-y-1 text-sm">{transparency.milestones.filter((m) => m.released).map((m) => (<li key={m.id}>Milestone {m.index}: {formatUsdc(m.amountStroops)} USDC released</li>))}</ul></div>)}</section>)}
    </main></div>
  );
}
