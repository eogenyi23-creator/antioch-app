import { Keypair, Account, TransactionBuilder, BASE_FEE, Operation, Memo } from '@stellar/stellar-sdk';

// Provide defaults so the suite can run without a pre-exported env.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://antioch:antioch@localhost:5432/antioch';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-jwt-refresh-secret';
process.env.SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
process.env.STELLAR_NETWORK = process.env.STELLAR_NETWORK ?? 'testnet';
process.env.ESCROW_WASM_HASH = process.env.ESCROW_WASM_HASH ?? 'dd5492141456f76eb9b6a2371bf4b3386d3eedbe2626274506569eafa1f9ce46';
process.env.DEPLOYER_SECRET = process.env.DEPLOYER_SECRET ?? 'SDUMMY';
process.env.TOKEN_CONTRACT_ID = process.env.TOKEN_CONTRACT_ID ?? 'CC6MCT6QYA4O2CEDABD43IL5A3L3ODATL4FZLDGTPOMK3GS4RE5BH67D';
process.env.USDC_ISSUER = process.env.USDC_ISSUER ?? 'GD3GCXWPPA6ZIGQGU6L4QPHVAJZKKJFPN7YFD4YZNKR23XFBNIO4DLR2';

import app from '../../index.js';

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
let server: ReturnType<typeof app.listen>;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as import('net').AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('auth flow', () => {
  it('issues a nonce of at most 28 bytes and verifies a Memo.text transaction', async () => {
    const kp = Keypair.random();
    const address = kp.publicKey();

    const challengeRes = await fetch(`${baseUrl}/api/v1/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stellarAddress: address }),
    });
    expect(challengeRes.ok).toBe(true);
    const challenge = (await challengeRes.json()) as { nonce: string };
    expect(Buffer.byteLength(challenge.nonce, 'utf8')).toBeLessThanOrEqual(28);

    const account = new Account(address, '0');
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(Operation.manageData({ name: 'antioch_auth', value: '1' }))
      .addMemo(Memo.text(challenge.nonce))
      .setTimeout(300)
      .build();
    tx.sign(kp);

    const verifyRes = await fetch(`${baseUrl}/api/v1/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stellarAddress: address, signedXdr: tx.toXDR() }),
    });
    expect(verifyRes.ok).toBe(true);
    const body = (await verifyRes.json()) as { accessToken: string };
    expect(body.accessToken).toBeTruthy();
  });
});
