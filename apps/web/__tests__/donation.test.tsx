import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FundingWidget } from '@/components/FundingWidget';

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
}));
jest.mock('@/lib/stellar', () => ({
  submitSignedXdr: jest.fn(),
}));
jest.mock('@/lib/config', () => ({
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
}));

const { apiFetch } = require('@/lib/api');
const { submitSignedXdr } = require('@/lib/stellar');

describe('donation flow', () => {
  const kit = { signTransaction: jest.fn() } as any;
  beforeEach(() => {
    jest.clearAllMocks();
    apiFetch.mockReset();
    submitSignedXdr.mockReset();
    kit.signTransaction.mockReset();
  });

  test('success flow', async () => {
    apiFetch
      .mockResolvedValueOnce({ unsignedXdr: 'unsigned' }) // init
      .mockResolvedValueOnce({ ok: true }); // submit
    kit.signTransaction.mockResolvedValue({ signedTxXdr: 'signed' });
    submitSignedXdr.mockResolvedValue('txhash123');

    render(
      <FundingWidget campaignId="c1" remainingCap={10000000n} status="active" kit={kit} walletAddress="GABC" user={{ address: "GABC", role: "donor" }} />,
    );
    fireEvent.change(screen.getByLabelText('Donation amount'), { target: { value: '1.0000000' } });
    fireEvent.click(screen.getByText('Donate'));
    await waitFor(() => expect(screen.getByTestId('success')).toBeInTheDocument());
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  test('user rejects signature', async () => {
    apiFetch.mockResolvedValueOnce({ unsignedXdr: 'unsigned' });
    kit.signTransaction.mockRejectedValue(new Error('User declined'));

    render(
      <FundingWidget campaignId="c1" remainingCap={10000000n} status="active" kit={kit} walletAddress="GABC" user={{ address: "GABC", role: "donor" }} />,
    );
    fireEvent.change(screen.getByLabelText('Donation amount'), { target: { value: '1.0000000' } });
    fireEvent.click(screen.getByText('Donate'));
    await waitFor(() => expect(screen.getByTestId('error')).toBeInTheDocument());
    expect(screen.getByTestId('error')).toHaveTextContent('User declined');
  });

  test('API error', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Campaign not accepting donations'));

    render(
      <FundingWidget campaignId="c1" remainingCap={10000000n} status="active" kit={kit} walletAddress="GABC" user={{ address: "GABC", role: "donor" }} />,
    );
    fireEvent.change(screen.getByLabelText('Donation amount'), { target: { value: '1.0000000' } });
    fireEvent.click(screen.getByText('Donate'));
    await waitFor(() => expect(screen.getByTestId('error')).toBeInTheDocument());
    expect(screen.getByTestId('error')).toHaveTextContent('Campaign not accepting donations');
  });

  test('over cap block', async () => {
    render(
      <FundingWidget campaignId="c1" remainingCap={5000000n} status="active" kit={kit} walletAddress="GABC" user={{ address: "GABC", role: "donor" }} />,
    );
    fireEvent.change(screen.getByLabelText('Donation amount'), { target: { value: '1.0000000' } });
    expect(screen.getByTestId('over-cap')).toBeInTheDocument();
    const btn = screen.getByText('Donate') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});