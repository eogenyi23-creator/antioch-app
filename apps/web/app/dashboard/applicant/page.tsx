/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useEffect, useState } from 'react';
import { Nav } from '@/components/Nav';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

export default function ApplicantDashboard() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [campaignId, setCampaignId] = useState('');
  const [milestoneIndex, setMilestoneIndex] = useState('0');
  const [notes, setNotes] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileMime, setFileMime] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<any[]>('/campaigns').then((cs) => {
      setCampaigns(cs.filter((c) => c.createdBy === user?.id));
    }).finally(() => setLoading(false));
  }, [user]);

  async function submitEvidence(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const files = fileUrl ? [{ url: fileUrl, name: fileName || 'file', mime: fileMime || 'application/octet-stream' }] : [];
    try {
      await apiFetch(`/campaigns/${campaignId}/milestones/${milestoneIndex}/evidence`, {
        method: 'POST',
        body: JSON.stringify({ notes, files }),
      });
      setMsg('Evidence submitted');
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  if (!user) return <div><Nav /><main className="p-8">Sign in required.</main></div>;

  return (
    <div><Nav /><main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold">Applicant dashboard</h1>
      <h2 className="mt-4 text-lg font-semibold">My campaigns</h2>
      {loading && <p>Loading…</p>}
      <ul className="mt-2 space-y-2">
        {campaigns.map((c) => (
          <li key={c.id} className="rounded border p-3">
            <Link href={`/campaigns/${c.id}`} className="font-semibold text-blue-600">{c.title}</Link>
            <span className="ml-2 text-sm text-gray-500">{c.status}</span>
          </li>
        ))}
        {!loading && campaigns.length === 0 && <li className="text-gray-500">No campaigns.</li>}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Submit evidence</h2>
      <form onSubmit={submitEvidence} className="mt-3 space-y-3 max-w-lg">
        <div><label className="block text-sm font-medium">Campaign ID</label><input value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" /></div>
        <div><label className="block text-sm font-medium">Milestone index</label><input value={milestoneIndex} onChange={(e) => setMilestoneIndex(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" /></div>
        <div><label className="block text-sm font-medium">Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" /></div>
        <div><label className="block text-sm font-medium">File URL</label><input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" /></div>
        <div><label className="block text-sm font-medium">File name</label><input value={fileName} onChange={(e) => setFileName(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" /></div>
        <div><label className="block text-sm font-medium">MIME</label><input value={fileMime} onChange={(e) => setFileMime(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus-ring" /></div>
        {msg && <p className="text-sm">{msg}</p>}
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white focus-ring">Submit evidence</button>
      </form>
    </main></div>
  );
}