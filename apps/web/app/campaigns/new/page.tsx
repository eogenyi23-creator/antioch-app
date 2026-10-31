'use client';
import { useState } from 'react';
import { Nav } from '@/components/Nav';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api';
import { CreateCampaignRequestSchema, toStroops } from '@antioch/shared';
import { useRouter } from 'next/navigation';
interface MilestoneInput { title: string; description: string; amount: string; }
export default function NewCampaignPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [goal, setGoal] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [approvers, setApprovers] = useState('');
  const [threshold, setThreshold] = useState('1');
  const [expiryDate, setExpiryDate] = useState('');
  const [milestones, setMilestones] = useState<MilestoneInput[]>([{ title: '', description: '', amount: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  function addMilestone() { setMilestones([...milestones, { title: '', description: '', amount: '' }]); }
  function updateMilestone(i: number, field: keyof MilestoneInput, value: string) { const next = [...milestones]; next[i] = { ...next[i], [field]: value }; setMilestones(next); }
  function removeMilestone(i: number) { setMilestones(milestones.filter((_, idx) => idx !== i)); }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    const approverList = approvers.split(',').map((s) => s.trim()).filter(Boolean);
    const body = { title, story, goal, beneficiary, approvers: approverList, threshold: Number(threshold), milestones: milestones.map((m) => ({ title: m.title, description: m.description || undefined, amount: m.amount })), expiryDate: expiryDate ? new Date(expiryDate).toISOString() : '' };
    const parsed = CreateCampaignRequestSchema.safeParse(body);
    if (!parsed.success) { setError(parsed.error.issues.map((i) => i.message).join('; ')); return; }
    try { const goalStroops = toStroops(goal); const sum = milestones.reduce((s, m) => s + toStroops(m.amount || '0'), 0n); if (sum !== goalStroops) { setError('Milestones must add up to the goal'); return; } } catch { setError('Invalid amounts'); return; }
    setSubmitting(true);
    try { const res = await apiFetch<{ id: string }>('/campaigns', { method: 'POST', body: JSON.stringify(parsed.data) }); router.push(`/campaigns/${res.id}`); } catch (err) { setError((err as Error).message); } finally { setSubmitting(false); }
  }
  if (!user) return <div><Nav /><main className="p-8">Please sign in as applicant.</main></div>;
  return (
    <div><Nav /><main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Create campaign</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div><label className="block text-sm font-medium" htmlFor="title">Title</label><input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" /></div>
        <div><label className="block text-sm font-medium" htmlFor="story">Story</label><textarea id="story" value={story} onChange={(e) => setStory(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" rows={4} /></div>
        <div><label className="block text-sm font-medium" htmlFor="goal">Goal (USDC)</label><input id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" /></div>
        <div><label className="block text-sm font-medium" htmlFor="beneficiary">Beneficiary (Stellar address)</label><input id="beneficiary" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" /></div>
        <div><label className="block text-sm font-medium" htmlFor="approvers">Approvers (comma-separated Stellar addresses)</label><input id="approvers" value={approvers} onChange={(e) => setApprovers(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" /></div>
        <div><label className="block text-sm font-medium" htmlFor="threshold">Threshold</label><input id="threshold" type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" /></div>
        <div><label className="block text-sm font-medium" htmlFor="expiry">Expiry date</label><input id="expiry" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" /></div>
        <div>
          <div className="flex items-center justify-between"><span className="text-sm font-medium">Milestones</span><button type="button" onClick={addMilestone} className="text-sm text-blue-600">+ Add</button></div>
          {milestones.map((m, i) => (
            <div key={i} className="mt-2 rounded border p-3 space-y-2">
              <input placeholder="Title" value={m.title} onChange={(e) => updateMilestone(i, 'title', e.target.value)} className="w-full rounded border px-3 py-2 focus-ring" />
              <input placeholder="Description" value={m.description} onChange={(e) => updateMilestone(i, 'description', e.target.value)} className="w-full rounded border px-3 py-2 focus-ring" />
              <input placeholder="Amount (USDC)" value={m.amount} onChange={(e) => updateMilestone(i, 'amount', e.target.value)} className="w-full rounded border px-3 py-2 focus-ring" />
              {milestones.length > 1 && <button type="button" onClick={() => removeMilestone(i)} className="text-sm text-red-600">Remove</button>}
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={submitting} className="rounded bg-blue-600 px-4 py-2 text-white focus-ring disabled:opacity-50">{submitting ? 'Creating…' : 'Create campaign'}</button>
      </form>
    </main></div>
  );
}