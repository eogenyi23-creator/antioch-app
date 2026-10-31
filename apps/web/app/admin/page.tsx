'use client';
import { useEffect, useState } from 'react';
import { Nav } from '@/components/Nav';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api';
import { mapApiError } from '@/lib/errors';
import type { CampaignSummary, UserSummary } from '@antioch/shared';

interface AuditEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
}

export default function AdminPage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [cs, us, al] = await Promise.all([
        apiFetch<CampaignSummary[]>('/admin/campaigns'),
        apiFetch<UserSummary[]>('/admin/users'),
        apiFetch<AuditEntry[]>('/admin/audit-log'),
      ]);
      setCampaigns(cs);
      setUsers(us);
      setAudit(al);
    } catch (e) { setError(mapApiError(e)); } finally { setLoading(false); }
  }
  useEffect(() => { if (user?.role === 'admin') load(); }, [user]);

  async function publish(id: string) {
    try { await apiFetch(`/campaigns/${id}/publish`, { method: 'POST' }); await load(); } catch (e) { alert(mapApiError(e)); }
  }

  async function changeRole(id: string, role: string) {
    try { await apiFetch(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }); await load(); } catch (e) { alert(mapApiError(e)); }
  }

  if (!user || user.role !== 'admin') return <div><Nav /><main className="p-8">Admins only.</main></div>;

  return (
    <div><Nav /><main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold">Admin</h1>
      {loading && <p>Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <h2 className="mt-6 text-lg font-semibold">Draft campaigns</h2>
      <ul className="mt-2 space-y-2">
        {campaigns.filter((c) => c.status === 'draft').map((c) => (
          <li key={c.id} className="rounded border p-3 flex items-center justify-between">
            <span>{c.title} ({c.status})</span>
            <button onClick={() => publish(c.id)} className="rounded bg-blue-600 px-3 py-1 text-sm text-white focus-ring">Publish</button>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 text-lg font-semibold">Users</h2>
      <table className="mt-2 w-full text-sm">
        <thead><tr className="text-left"><th>Address</th><th>Role</th><th>Change</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="py-2">{u.stellarAddress}</td>
              <td>{u.role}</td>
              <td>
                <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} className="rounded border px-2 py-1 focus-ring">
                  <option value="donor">donor</option>
                  <option value="applicant">applicant</option>
                  <option value="approver">approver</option>
                  <option value="admin">admin</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-6 text-lg font-semibold">Audit log</h2>
      <ul className="mt-2 space-y-1 text-xs">
        {audit.map((a) => (
          <li key={a.id}>{a.action} — {a.resourceType} {a.resourceId} ({new Date(a.createdAt).toLocaleString()})</li>
        ))}
      </ul>
    </main></div>
  );
}