import { render, screen } from '@testing-library/react';
import { Nav } from '@/components/Nav';

const mockUseAuth = jest.fn();
jest.mock('@/components/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function renderNav(role: string | null) {
  mockUseAuth.mockReturnValue({
    user: role ? { address: 'GADMIN', role } : null,
    walletAddress: null,
    connectWallet: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  });
  render(<Nav />);
}

test('shows New link to an applicant', () => {
  renderNav('applicant');
  expect(screen.getByRole('link', { name: /^New$/ })).toBeInTheDocument();
});

test('shows New link to an admin', () => {
  renderNav('admin');
  expect(screen.getByRole('link', { name: /^New$/ })).toBeInTheDocument();
});

test('hides New link from a donor', () => {
  renderNav('donor');
  expect(screen.queryByRole('link', { name: /^New$/ })).not.toBeInTheDocument();
});

test('hides New link from an approver', () => {
  renderNav('approver');
  expect(screen.queryByRole('link', { name: /^New$/ })).not.toBeInTheDocument();
});

test('hides New link when not signed in', () => {
  renderNav(null);
  expect(screen.queryByRole('link', { name: /^New$/ })).not.toBeInTheDocument();
});
