import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/components/AuthProvider';

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
}));
jest.mock('@/lib/config', () => ({
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  STELLAR_NETWORK: 'testnet',
}));
jest.mock('@creit.tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: jest.fn().mockImplementation(() => ({ getAddress: jest.fn(), signTransaction: jest.fn() })),
  WalletNetwork: { TESTNET: 'testnet', PUBLIC: 'public' },
  FreighterModule: jest.fn(),
  xBullModule: jest.fn(),
  AlbedoModule: jest.fn(),
}));

const api = require('@/lib/api');

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

test('refreshes on load', async () => {
  api.getAccessToken.mockReturnValue(null);
  api.getRefreshToken.mockReturnValue('refresh-tok');
  api.apiFetch.mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh' });
  // decodeJwt needs atob; token payload base64
  const payload = btoa(JSON.stringify({ sub: 'u1', address: 'GABC', role: 'donor' }));
  api.getAccessToken.mockReturnValueOnce(null);

  render(
    <AuthProvider>
      <div>app</div>
    </AuthProvider>,
  );

  expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('app')).toBeInTheDocument());
  expect(api.apiFetch).toHaveBeenCalledWith('/auth/refresh', expect.any(Object));
});
