import { Nav } from '@/components/Nav';
import Link from 'next/link';

const SHOWCASE = 'CDVECNXDBALTJUXWXLHINICDG3V4FNSYZ24IJSKKLESHX323VRII2BHP';

export default function Home() {
  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <section className="text-center">
          <h1 className="text-4xl font-bold text-blue-700">Antioch</h1>
          <p className="mt-4 text-lg text-gray-700">
            Non-custodial giving on Stellar. Funds are held in per-campaign escrow and released
            milestone by milestone after independent approvers verify the work.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/campaigns" className="rounded bg-blue-600 px-4 py-2 text-white focus-ring">
              Browse campaigns
            </Link>
            <Link
              href={`https://stellar.expert/explorer/testnet/contract/${SHOWCASE}`}
              className="rounded border px-4 py-2 focus-ring"
              target="_blank"
            >
              Showcase on explorer
            </Link>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <ol className="mt-4 grid gap-4 md:grid-cols-3">
            <li className="rounded border p-4">
              <strong>1. Fund</strong>
              <p className="mt-2 text-sm text-gray-600">Donors give USDC to a campaign. Funds are locked in escrow.</p>
            </li>
            <li className="rounded border p-4">
              <strong>2. Approve</strong>
              <p className="mt-2 text-sm text-gray-600">Independent approvers verify evidence and approve milestones.</p>
            </li>
            <li className="rounded border p-4">
              <strong>3. Release</strong>
              <p className="mt-2 text-sm text-gray-600">Once threshold is met, funds release to the beneficiary.</p>
            </li>
          </ol>
        </section>

        <FeaturedCampaigns />
      </main>
    </div>
  );
}

async function FeaturedCampaigns() {
  let campaigns: { id: string; title: string; status: string }[] = [];
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}/api/v1/campaigns`,
      { cache: 'no-store' },
    );
    if (res.ok) campaigns = await res.json();
  } catch {
    /* ignore */
  }
  const featured = campaigns.slice(0, 3);
  if (featured.length === 0) return null;
  return (
    <section className="mt-12">
      <h2 className="text-2xl font-semibold">Featured campaigns</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {featured.map((c) => (
          <Link key={c.id} href={`/campaigns/${c.id}`} className="rounded border p-4 hover:shadow">
            <h3 className="font-semibold">{c.title}</h3>
            <p className="mt-1 text-sm text-gray-500">{c.status}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}