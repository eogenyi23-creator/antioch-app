import { render, screen } from '@testing-library/react';
import { MilestoneTimeline } from '@/components/MilestoneTimeline';

const campaign = { threshold: 2, approvers: ['GAPPROVER'] };

test('milestone buttons only for right user', () => {
  const milestones = [
    { id: '1', index: 0, title: 'M1', amountStroops: '10000000', released: false, onChain: { released: false, approvalCount: 1, threshold: 2 } },
  ];
  const user = { address: 'GAPPROVER', role: 'approver' };
  render(
    <MilestoneTimeline milestones={milestones} campaign={campaign} user={user} approvedByMe={new Set()} />,
  );
  expect(screen.getByTestId('approve-0')).toBeInTheDocument();
  expect(screen.queryByTestId('release-0')).not.toBeInTheDocument();
});

test('release button when threshold met', () => {
  const milestones = [
    { id: '1', index: 0, title: 'M1', amountStroops: '10000000', released: false, onChain: { released: false, approvalCount: 2, threshold: 2 } },
  ];
  const user = { address: 'GDONOR', role: 'donor' };
  render(
    <MilestoneTimeline milestones={milestones} campaign={campaign} user={user} approvedByMe={new Set()} />,
  );
  expect(screen.queryByTestId('approve-0')).not.toBeInTheDocument();
  expect(screen.getByTestId('release-0')).toBeInTheDocument();
});

test('no approve after approved', () => {
  const milestones = [
    { id: '1', index: 0, title: 'M1', amountStroops: '10000000', released: false, onChain: { released: false, approvalCount: 1, threshold: 2 } },
  ];
  const user = { address: 'GAPPROVER', role: 'approver' };
  render(
    <MilestoneTimeline milestones={milestones} campaign={campaign} user={user} approvedByMe={new Set([0])} />,
  );
  expect(screen.queryByTestId('approve-0')).not.toBeInTheDocument();
});