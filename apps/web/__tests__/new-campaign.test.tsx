import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewCampaignPage from '@/app/campaigns/new/page';

const mockUseAuth = jest.fn();
const mockRouter = { push: jest.fn() };

jest.mock('@/components/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
}));

const { apiFetch } = require('@/lib/api');
const VALID_ADDR = 'G' + 'A'.repeat(55);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { address: VALID_ADDR, role: 'applicant' },
    walletAddress: null,
    connectWallet: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  });
  mockRouter.push.mockReset();
  apiFetch.mockReset();
});

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Test Campaign' } });
  fireEvent.change(screen.getByLabelText(/Story/i), { target: { value: 'A test campaign' } });
  fireEvent.change(screen.getByLabelText(/Goal/i), { target: { value: '100.0000000' } });
  fireEvent.change(screen.getByLabelText(/Beneficiary/i), { target: { value: VALID_ADDR } });
  fireEvent.change(screen.getByLabelText(/Approvers/i), { target: { value: VALID_ADDR } });
  fireEvent.change(screen.getByLabelText(/Threshold/i), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText(/Expiry date/i), { target: { value: '2030-01-01' } });
  fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'Milestone 1' } });
  fireEvent.change(screen.getByPlaceholderText(/Amount/), { target: { value: '100.0000000' } });
}

test('does not double-submit on fast double click', async () => {
  let resolveCreate!: (v: { id: string }) => void;
  apiFetch.mockImplementation(() => new Promise<{ id: string }>((res) => { resolveCreate = res; }));

  render(<NewCampaignPage />);
  fillValidForm();

  const btn = screen.getByRole('button', { name: /Create campaign/ });
  fireEvent.click(btn);
  fireEvent.click(btn);

  expect(apiFetch).toHaveBeenCalledTimes(1);

  resolveCreate({ id: 'c1' });
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/campaigns/c1'));
  expect(apiFetch).toHaveBeenCalledTimes(1);
});

test('submits once and navigates on success', async () => {
  apiFetch.mockResolvedValue({ id: 'c2' });

  render(<NewCampaignPage />);
  fillValidForm();
  fireEvent.click(screen.getByRole('button', { name: /Create campaign/ }));

  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/campaigns/c2'));
  expect(apiFetch).toHaveBeenCalledTimes(1);
});
