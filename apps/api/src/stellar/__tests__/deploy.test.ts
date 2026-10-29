/**
 * Tests for the campaign deploy transaction builder.
 *
 * Verifies that deployCampaignEscrow builds a CREATE_CONTRACT_V2 operation
 * with constructor arguments in the correct order and types.
 *
 * The Soroban RPC server is mocked via jest.spyOn — no real network calls
 * are made. The Transaction object is captured at prepareTransaction time
 * so we can inspect operations without re-decoding XDR.
 */

import {
  Address,
  Keypair,
  Account,
  nativeToScVal,
  scValToNative,
  Transaction,
} from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Env stubs — mock before importing service
// ---------------------------------------------------------------------------

const DEPLOYER_KP = Keypair.random();
const TOKEN_CONTRACT = 'CDVECNXDBALTJUXWXLHINICDG3V4FNSYZ24IJSKKLESHX323VRII2BHP';
const WASM_HASH = 'dd5492141456f76eb9b6a2371bf4b3386d3eedbe2626274506569eafa1f9ce46';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

jest.mock('../../config/env', () => ({
  env: {
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    deployerSecret: DEPLOYER_KP.secret(),
    escrowWasmHash: WASM_HASH,
    tokenContractId: TOKEN_CONTRACT,
    networkPassphrase: NETWORK_PASSPHRASE,
    stellarNetwork: 'testnet',
    usdcAssetCode: 'USDC',
    usdcIssuer: 'GD3GCXWPPA6ZIGQGU6L4QPHVAJZKKJFPN7YFD4YZNKR23XFBNIO4DLR2',
  },
}));

import { deployCampaignEscrow, sorobanServer } from '../service.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const APPROVER_1 = Keypair.random().publicKey();
const APPROVER_2 = Keypair.random().publicKey();
const BENEFICIARY = Keypair.random().publicKey();

const FAKE_CONTRACT_ID = 'CDVECNXDBALTJUXWXLHINICDG3V4FNSYZ24IJSKKLESHX323VRII2BHP';

// Captured transaction from the mock
let capturedTx: Transaction | null = null;

// Type alias for the parsed invokeHostFunction operation in sdk 17
type InvokeHostFunctionOp = {
  type: 'invokeHostFunction';
  func: {
    type: string;
    createContractV2: {
      constructorArgs: ReturnType<typeof nativeToScVal>[];
      executable: { type: string; wasmHash: Uint8Array };
    };
  };
  auth: unknown[];
};

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

function setupServerMocks() {
  capturedTx = null;

  jest.spyOn(sorobanServer, 'getAccount').mockResolvedValue(
    new Account(DEPLOYER_KP.publicKey(), '100') as unknown as Awaited<
      ReturnType<typeof sorobanServer.getAccount>
    >,
  );

  jest
    .spyOn(sorobanServer, 'prepareTransaction')
    .mockImplementation(async (tx) => {
      capturedTx = tx as Transaction;
      return tx as Awaited<ReturnType<typeof sorobanServer.prepareTransaction>>;
    });

  jest.spyOn(sorobanServer, 'sendTransaction').mockResolvedValue({
    status: 'PENDING',
    hash: 'fakehash123',
    latestLedger: 1001,
    latestLedgerCloseTime: 1,
  } as unknown as Awaited<ReturnType<typeof sorobanServer.sendTransaction>>);

  jest.spyOn(sorobanServer, 'getTransaction').mockResolvedValue({
    status: 'SUCCESS',
    returnValue: new Address(FAKE_CONTRACT_ID).toScVal(),
  } as unknown as Awaited<ReturnType<typeof sorobanServer.getTransaction>>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deployCampaignEscrow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupServerMocks();
  });

  it('returns the contract ID from the transaction return value', async () => {
    const contractId = await deployCampaignEscrow({
      approvers: [APPROVER_1, APPROVER_2],
      threshold: 2,
      beneficiary: BENEFICIARY,
      milestoneAmounts: [2_000_000_000n, 3_000_000_000n],
      expiryLedger: 1500,
    });
    expect(contractId).toBe(FAKE_CONTRACT_ID);
  });

  it('builds exactly one invokeHostFunction operation', async () => {
    await deployCampaignEscrow({
      approvers: [APPROVER_1],
      threshold: 1,
      beneficiary: BENEFICIARY,
      milestoneAmounts: [1_000_000_000n],
      expiryLedger: 2000,
    });

    expect(capturedTx).not.toBeNull();
    expect(capturedTx!.operations).toHaveLength(1);
    expect(capturedTx!.operations[0].type).toBe('invokeHostFunction');
  });

  it('uses CREATE_CONTRACT_V2 (hostFunctionTypeCreateContractV2)', async () => {
    await deployCampaignEscrow({
      approvers: [APPROVER_1],
      threshold: 1,
      beneficiary: BENEFICIARY,
      milestoneAmounts: [1_000_000_000n],
      expiryLedger: 2000,
    });

    expect(capturedTx).not.toBeNull();
    const op = capturedTx!.operations[0] as unknown as InvokeHostFunctionOp;
    expect(op.func.type).toBe('hostFunctionTypeCreateContractV2');
  });

  it('passes 6 constructor arguments in the correct order and types', async () => {
    const approvers = [APPROVER_1, APPROVER_2];
    const threshold = 2;
    const milestones = [2_000_000_000n, 3_000_000_000n];
    const expiryLedger = 1500;

    await deployCampaignEscrow({
      approvers,
      threshold,
      beneficiary: BENEFICIARY,
      milestoneAmounts: milestones,
      expiryLedger,
    });

    expect(capturedTx).not.toBeNull();
    const op = capturedTx!.operations[0] as unknown as InvokeHostFunctionOp;
    const { constructorArgs: args } = op.func.createContractV2;

    expect(args).toHaveLength(6);

    // arg 0: approvers Vec<Address>
    expect(args[0].type).toBe('scvVec');
    const approverVec = scValToNative(args[0]) as string[];
    expect(approverVec).toHaveLength(approvers.length);
    approvers.forEach((a, i) => expect(approverVec[i]).toBe(a));

    // arg 1: threshold u32
    expect(args[1].type).toBe('scvU32');
    expect(scValToNative(args[1])).toBe(threshold);

    // arg 2: beneficiary Address
    expect(args[2].type).toBe('scvAddress');
    expect(scValToNative(args[2])).toBe(BENEFICIARY);

    // arg 3: token Address (from env)
    expect(args[3].type).toBe('scvAddress');
    expect(scValToNative(args[3])).toBe(TOKEN_CONTRACT);

    // arg 4: milestones Vec<i128>
    expect(args[4].type).toBe('scvVec');
    const milestoneVec = scValToNative(args[4]) as bigint[];
    expect(milestoneVec).toHaveLength(milestones.length);
    milestones.forEach((m, i) => expect(milestoneVec[i]).toBe(m));

    // arg 5: expiry_ledger u32
    expect(args[5].type).toBe('scvU32');
    expect(scValToNative(args[5])).toBe(expiryLedger);
  });

  it('embeds the WASM hash from env in the deploy operation', async () => {
    await deployCampaignEscrow({
      approvers: [APPROVER_1],
      threshold: 1,
      beneficiary: BENEFICIARY,
      milestoneAmounts: [500_000_000n],
      expiryLedger: 2000,
    });

    expect(capturedTx).not.toBeNull();
    const op = capturedTx!.operations[0] as unknown as InvokeHostFunctionOp;
    // wasmHash is an xdr.Hash wrapper in sdk 17; extract raw bytes with toBytes()
    const wasmHashObj = op.func.createContractV2.executable.wasmHash as unknown as { toBytes(): Uint8Array };
    const wasmHash = wasmHashObj.toBytes();

    const expected = Buffer.from(WASM_HASH, 'hex');
    expect(Buffer.from(wasmHash).equals(expected)).toBe(true);
  });
});
