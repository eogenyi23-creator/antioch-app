# @antioch/escrow-client

XDR builders and read helpers for the [antioch-escrow](https://github.com/eogenyi23-creator/antioch-escrow) Soroban contract.

**This package is a copy from the `antioch-escrow` repository.** It is not published to npm. When the source repo is updated, copy the updated source files here and update the commit reference below.

Source repo: [https://github.com/eogenyi23-creator/antioch-escrow](https://github.com/eogenyi23-creator/antioch-escrow)  
Source commit: _update this when syncing_

---

## What is here

| Export | Description |
|---|---|
| `buildFund` | Build unsigned XDR for `fund(donor, amount)` |
| `buildApproveMilestone` | Build unsigned XDR for `approve_milestone(approver, index)` |
| `buildReleaseMilestone` | Build unsigned XDR for `release_milestone(index)` |
| `buildRefund` | Build unsigned XDR for `refund(donor)` |
| `readState` | Read contract state via simulation |
| `readFundedTotal` | Read funded total (stroops) |
| `readReleasedTotal` | Read released total (stroops) |
| `readMilestone` | Read milestone `(amount, released)` by index |
| `readMilestoneCount` | Read number of milestones |
| `readApprovals` | Read approval count for a milestone index |
| `readDonorContribution` | Read a donor's total contribution |
| `toStroops` | Convert decimal USDC string to `bigint` stroops |
| `fromStroops` | Convert `bigint` stroops to decimal USDC string |
| `decodeError` | Decode Soroban contract error code to `{ code, name, message }` |

The **deploy transaction builder** and **trustline check** are in `apps/api` because they require the deployer secret key and server-side Stellar SDK calls beyond what this client library exposes.

---

## Contract facts

- Network: Stellar testnet
- Soroban RPC: `https://soroban-testnet.stellar.org`
- Network passphrase: `Test SDF Network ; September 2015`
- WASM hash: `dd5492141456f76eb9b6a2371bf4b3386d3eedbe2626274506569eafa1f9ce46` (stored in `ESCROW_WASM_HASH`)
- Showcase escrow: `CDVECNXDBALTJUXWXLHINICDG3V4FNSYZ24IJSKKLESHX323VRII2BHP`
- Test token: `CC6MCT6QYA4O2CEDABD43IL5A3L3ODATL4FZLDGTPOMK3GS4RE5BH67D` (`DEMO:GD3GCXWPPA6ZIGQGU6L4QPHVAJZKKJFPN7YFD4YZNKR23XFBNIO4DLR2`)

All contract IDs, asset codes and issuers are configurable via environment variables. Nothing is hardcoded.

---

## Usage

```typescript
import {
  buildFund,
  readFundedTotal,
  toStroops,
  fromStroops,
  decodeError,
} from '@antioch/escrow-client';

// Convert display amount to stroops
const amount = toStroops('10.0000000'); // bigint 100_000_000n

// Build unsigned fund XDR
const xdr = await buildFund({
  rpcUrl: process.env.SOROBAN_RPC_URL!,
  contractId: campaign.contract_id,
  donor: 'GDONER...',
  amount,
  networkPassphrase: 'Test SDF Network ; September 2015',
});

// Read funded total
const funded = await readFundedTotal({
  rpcUrl: process.env.SOROBAN_RPC_URL!,
  contractId: campaign.contract_id,
});
console.log(fromStroops(funded)); // "10.0000000"

// Decode a contract error
const err = decodeError(16);
// { code: 16, name: 'FundingCapExceeded', message: 'Donation would exceed campaign funding cap' }
```

---

## Syncing from the source repo

When `antioch-escrow` is updated:

1. Copy the updated source files from `packages/escrow-client/src/` in the source repo.
2. Run `npm run build` in this package to verify it compiles.
3. Update the commit reference at the top of this README.
4. Open a PR with only the sync changes.

Do not add logic to this package that is not in the source repo. Custom API-only logic (deploy builder, trustline check) belongs in `apps/api`.
