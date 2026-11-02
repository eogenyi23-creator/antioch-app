// One-time testnet setup for a local Antioch run.
// Creates an issuer, a donor and a beneficiary account, issues a TESTUSD token,
// deploys its Soroban contract, and points .env at it.
// Secrets are written to ~/antioch-testnet-keys.json (outside the repo), never printed.
import {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  rpc,
} from '@stellar/stellar-sdk';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const NET = Networks.TESTNET;
const server = new rpc.Server(RPC_URL);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fund(kp) {
  const res = await fetch('https://friendbot.stellar.org/?addr=' + kp.publicKey());
  if (!res.ok) throw new Error('friendbot failed: ' + res.status);
}

async function send(kp, ops, soroban = false) {
  const account = await server.getAccount(kp.publicKey());
  const builder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NET }).setTimeout(120);
  for (const op of ops) builder.addOperation(op);
  let tx = builder.build();
  if (soroban) tx = await server.prepareTransaction(tx);
  tx.sign(kp);
  const sent = await server.sendTransaction(tx);
  if (sent.status === 'ERROR') {
    throw new Error('send failed: ' + (sent.errorResult ? sent.errorResult.toXDR('base64') : 'unknown'));
  }
  for (let i = 0; i < 40; i++) {
    const got = await server.getTransaction(sent.hash);
    if (got.status === 'SUCCESS') return sent.hash;
    if (got.status === 'FAILED') throw new Error('transaction failed: ' + sent.hash);
    await sleep(1000);
  }
  throw new Error('timed out waiting for ' + sent.hash);
}

async function main() {
  const issuer = Keypair.random();
  const donor = Keypair.random();
  const beneficiary = Keypair.random();

  console.log('Funding accounts with Friendbot...');
  for (const kp of [issuer, donor, beneficiary]) await fund(kp);

  const asset = new Asset('TESTUSD', issuer.publicKey());

  console.log('Adding trustlines...');
  await send(donor, [Operation.changeTrust({ asset })]);
  await send(beneficiary, [Operation.changeTrust({ asset })]);

  console.log('Sending 10000 TESTUSD to the donor...');
  await send(issuer, [Operation.payment({ destination: donor.publicKey(), asset, amount: '10000' })]);

  console.log('Deploying the token contract...');
  await send(issuer, [Operation.createStellarAssetContract({ asset })], true);
  const contractId = asset.contractId(NET);

  const envPath = path.resolve(process.cwd(), '.env');
  let env = fs.readFileSync(envPath, 'utf8');
  const set = (k, v) => {
    const re = new RegExp('^' + k + '=.*$', 'm');
    env = re.test(env) ? env.replace(re, k + '=' + v) : env + '\n' + k + '=' + v + '\n';
  };
  set('TOKEN_CONTRACT_ID', contractId);
  set('USDC_ISSUER', issuer.publicKey());
  set('USDC_ASSET_CODE', 'TESTUSD');
  set('NEXT_PUBLIC_ASSET_CODE', 'TESTUSD');
  fs.writeFileSync(envPath, env);

  const keyFile = path.join(os.homedir(), 'antioch-testnet-keys.json');
  fs.writeFileSync(
    keyFile,
    JSON.stringify(
      {
        issuer: { public: issuer.publicKey(), secret: issuer.secret() },
        donor: { public: donor.publicKey(), secret: donor.secret() },
        beneficiary: { public: beneficiary.publicKey(), secret: beneficiary.secret() },
        tokenContractId: contractId,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  console.log('\nDone.');
  console.log('Token contract :', contractId);
  console.log('Donor public   :', donor.publicKey());
  console.log('Beneficiary    :', beneficiary.publicKey());
  console.log('.env updated. Keys saved to', keyFile);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
