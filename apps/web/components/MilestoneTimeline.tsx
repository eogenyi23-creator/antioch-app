'use client';

import { fromStroops } from '@antioch/shared';

export interface MilestoneItem {
  id: string;
  index: number;
  title: string;
  description?: string | null;
  amountStroops: string;
  released: boolean;
  onChain?: { released: boolean; approvalCount: number; threshold: number } | null;
}

export function MilestoneTimeline({
  milestones,
  campaign,
  user,
  approvedByMe,
  onApprove,
  onRelease,
}: {
  milestones: MilestoneItem[];
  campaign: { threshold: number; approvers: string[] };
  user: { address: string; role: string } | null;
  approvedByMe: Set<number>;
  onApprove?: (index: number) => void;
  onRelease?: (index: number) => void;
}) {
  const isApprover = !!user && (campaign.approvers.includes(user.address) || user.role === 'admin');
  return (
    <ol className="mt-3 space-y-3" data-testid="milestone-timeline">
      {milestones.map((m) => {
        const onChain = m.onChain;
        const released = onChain?.released ?? m.released;
        const approvals = onChain?.approvalCount ?? 0;
        const threshold = onChain?.threshold ?? campaign.threshold;
        const thresholdMet = approvals >= threshold;
        const releasable = thresholdMet && !released;
        const canApprove = isApprover && !approvedByMe.has(m.index) && !released;
        return (
          <li key={m.id} className="rounded border p-4" data-testid={`milestone-${m.index}`}>
            <h3 className="font-semibold">{m.title}</h3>
            <p className="text-sm">Amount: {fromStroops(BigInt(m.amountStroops))} USDC</p>
            <p className="text-sm">Status: {released ? 'Released' : thresholdMet ? 'Threshold met' : 'Pending'}</p>
            <p className="text-sm">Approvals: {approvals} / {threshold}</p>
            {canApprove && (
              <button onClick={() => onApprove?.(m.index)} className="mt-2 rounded bg-blue-600 px-3 py-1 text-sm text-white focus-ring" data-testid={`approve-${m.index}`}>
                Approve
              </button>
            )}
            {releasable && user && (
              <button onClick={() => onRelease?.(m.index)} className="mt-2 rounded border px-3 py-1 text-sm focus-ring" data-testid={`release-${m.index}`}>
                Release now
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}