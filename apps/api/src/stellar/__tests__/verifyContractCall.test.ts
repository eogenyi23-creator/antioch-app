import {
  Keypair,
  Account,
  TransactionBuilder,
  BASE_FEE,
  Operation,
  Address,
  nativeToScVal,
} from '@stellar/stellar-sdk';

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const CONTRACT_ID = 'CDVECNXDBALTJUXWXLHINICDG3V4FNSYZ24IJSKKLESHX323VRII2BHP';
const OTHER_CONTRACT = 'CB43ZAY7TWNCXAYMXZ4LMTJ6SY5FQJRJ24S6SG2E6LM32A6W65KPUWC7';
const DONOR = 'GBGFVG7STXINXG5M6RVSDFTHDXKXS3SJNNWZR6R6J3R7XQWBONO7SFWX';
const AMOUNT = 1_000_000_000n;

jest.mock('../../config/env', () => ({
  env: {
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
}));

import { verifyContractCall, sorobanServer } from '../service.js';

function buildTx(
  functionName: string,
  args: unknown[],
  contractId: string = CONTRACT_ID,
  opCount = 1,
): string {
  const kp = Keypair.random();
  const acct = new Account(kp.publicKey(), '1');
  const op = Operation.invokeContractFunction({
    contract: contractId,
    function: functionName,
    args: args as never,
    source: kp.publicKey(),
  });
  let builder = new TransactionBuilder(acct, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  }).addOperation(op);
  for (let i = 1; i < opCount; i++) builder = builder.addOperation(op);
  const tx = builder.setTimeout(100).build();
  return tx.toXDR();
}

function mockTx(xdr: string) {
  jest.spyOn(sorobanServer, 'getTransaction').mockResolvedValue({
    status: 'SUCCESS',
    envelopeXdr: xdr,
  } as never);
}

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('verifyContractCall', () => {
  it('accepts a correct fund call', async () => {
    const xdr = buildTx('fund', [
      new Address(DONOR).toScVal(),
      nativeToScVal(AMOUNT, { type: 'i128' }),
    ]);
    mockTx(xdr);
    const res = await verifyContractCall('hash', {
      contractId: CONTRACT_ID,
      functionName: 'fund',
      donor: DONOR,
      amount: AMOUNT,
    });
    expect(res.status).toBe('SUCCESS');
  });

  it('rejects a wrong contract', async () => {
    const xdr = buildTx('fund', [
      new Address(DONOR).toScVal(),
      nativeToScVal(AMOUNT, { type: 'i128' }),
    ], OTHER_CONTRACT);
    mockTx(xdr);
    await expect(
      verifyContractCall('hash', {
        contractId: CONTRACT_ID,
        functionName: 'fund',
        donor: DONOR,
        amount: AMOUNT,
      }),
    ).rejects.toThrow(/Contract mismatch/);
  });

  it('rejects a wrong function', async () => {
    const xdr = buildTx('fund', [
      new Address(DONOR).toScVal(),
      nativeToScVal(AMOUNT, { type: 'i128' }),
    ]);
    mockTx(xdr);
    await expect(
      verifyContractCall('hash', {
        contractId: CONTRACT_ID,
        functionName: 'approve_milestone',
        approver: DONOR,
        milestoneIndex: 0,
      }),
    ).rejects.toThrow(/Function mismatch/);
  });

  it('rejects a wrong donor', async () => {
    const xdr = buildTx('fund', [
      new Address(DONOR).toScVal(),
      nativeToScVal(AMOUNT, { type: 'i128' }),
    ]);
    mockTx(xdr);
    await expect(
      verifyContractCall('hash', {
        contractId: CONTRACT_ID,
        functionName: 'fund',
        donor: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        amount: AMOUNT,
      }),
    ).rejects.toThrow(/Argument mismatch/);
  });

  it('rejects a wrong amount', async () => {
    const xdr = buildTx('fund', [
      new Address(DONOR).toScVal(),
      nativeToScVal(AMOUNT, { type: 'i128' }),
    ]);
    mockTx(xdr);
    await expect(
      verifyContractCall('hash', {
        contractId: CONTRACT_ID,
        functionName: 'fund',
        donor: DONOR,
        amount: AMOUNT + 1n,
      }),
    ).rejects.toThrow(/Argument mismatch/);
  });

  it('rejects a wrong milestone index', async () => {
    const xdr = buildTx('approve_milestone', [
      new Address(DONOR).toScVal(),
      nativeToScVal(0, { type: 'u32' }),
    ]);
    mockTx(xdr);
    await expect(
      verifyContractCall('hash', {
        contractId: CONTRACT_ID,
        functionName: 'approve_milestone',
        approver: DONOR,
        milestoneIndex: 1,
      }),
    ).rejects.toThrow(/Argument mismatch/);
  });

  it('rejects a transaction with two operations', async () => {
    const xdr = buildTx('fund', [
      new Address(DONOR).toScVal(),
      nativeToScVal(AMOUNT, { type: 'i128' }),
    ], CONTRACT_ID, 2);
    mockTx(xdr);
    await expect(
      verifyContractCall('hash', {
        contractId: CONTRACT_ID,
        functionName: 'fund',
        donor: DONOR,
        amount: AMOUNT,
      }),
    ).rejects.toThrow(/exactly one operation/);
  });

  it('throws when an expected value is missing', async () => {
    await expect(
      verifyContractCall('hash', {
        contractId: CONTRACT_ID,
        functionName: 'fund',
        donor: DONOR,
      } as never),
    ).rejects.toThrow(/Missing expected value/);
  });

  it('throws when contractId is missing', async () => {
    await expect(
      verifyContractCall('hash', {
        functionName: 'fund',
        donor: DONOR,
        amount: AMOUNT,
      } as never),
    ).rejects.toThrow(/Missing contractId/);
  });
});

// Live test (skipped unless env var set)
const LIVE =
  !!process.env.LIVE_TEST ||
  !!process.env.RUN_LIVE_TESTS ||
  !!process.env.LIVE_TESTNET ||
  !!process.env.TESTNET_LIVE;

(LIVE ? it : it.skip)(
  'live testnet transaction 0613a879...',
  async () => {
    const hash =
      '0613a879bcbb9b8bd59c7833c7ce5cbda94c75587d21461c5c301a5ba4346baf';
    const res = await verifyContractCall(hash, {
      contractId: 'CB43ZAY7TWNCXAYMXZ4LMTJ6SY5FQJRJ24S6SG2E6LM32A6W65KPUWC7',
      functionName: 'approve_milestone',
      approver: 'GBGFVG7STXINXG5M6RVSDFTHDXKXS3SJNNWZR6R6J3R7XQWBONO7SFWX',
      milestoneIndex: 0,
    });
    expect(res.status).toBe('SUCCESS');
  },
  60000,
);
