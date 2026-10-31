'use client';

import { useEffect, useState } from 'react';
import { Nav } from '@/components/Nav';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Campaign {
  id: string;
  title: string;
  story: string;
  goalStroops: string;
  status: string;
  beneficiary: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    setLoading(true);
    apiFetch<Campaign[]>('/campaigns')
      .then(setCampaigns)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = campaigns.filter((c) => {
    if (status !== 'all' && c.status !== status) return false;
    if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <input
            type="search"
            placeholder="Search campaigns"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded border px-3 py-2 focus-ring"
            aria-label="Search campaigns"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border px-3 py-2 focus-ring"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {loading && <p className="mt-6">Loading campaigns…</p>}
        {error && <p className="mt-6 text-red-600">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="mt-6 text-gray-500">No campaigns found.</p>
        )}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {filtered.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`} className="rounded border p-4 hover:shadow focus-ring">
              <h2 className="font-semibold">{c.title}</h2>
              <p className="mt-1 text-sm text-gray-600 line-clamp-2">{c.story}</p>
              <p className="mt-2 text-xs text-gray-500">
                Status: {c.status} · Goal: {c.goalStroops} stroops
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}