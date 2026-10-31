'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

export function Nav() {
  const { user, walletAddress, connectWallet, signIn, signOut } = useAuth();
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-blue-700">
          Antioch
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/campaigns" className="hover:underline">Campaigns</Link>
          {user?.role === 'applicant' && <Link href="/campaigns/new" className="hover:underline">New</Link>}
          {user && <Link href="/dashboard/donor" className="hover:underline">Donor</Link>}
          {user?.role === 'applicant' && <Link href="/dashboard/applicant" className="hover:underline">Applicant</Link>}
          {user?.role === 'approver' && <Link href="/dashboard/approver" className="hover:underline">Approver</Link>}
          {user?.role === 'admin' && <Link href="/admin" className="hover:underline">Admin</Link>}
          {!walletAddress ? (
            <button onClick={connectWallet} className="rounded bg-blue-600 px-3 py-1 text-white focus-ring">
              Connect wallet
            </button>
          ) : !user ? (
            <button onClick={signIn} className="rounded bg-blue-600 px-3 py-1 text-white focus-ring">
              Sign in
            </button>
          ) : (
            <button onClick={signOut} className="rounded border px-3 py-1 focus-ring">
              Sign out ({user.role})
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}