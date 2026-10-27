# Architecture

Antioch is a non-custodial giving platform on Stellar. This document describes the system boundaries, component responsibilities and the key technical decisions. For the full product spec see [spec.md](spec.md).

---

## System overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│  apps/web  (Next.js App Router, TypeScript, Tailwind)               │
│  Stellar Wallets Kit (Freighter · xBull · Albedo)                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP / JSON (JWT)
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│  apps/api  (Node.js, Express, TypeScript)                          │
│  Auth · Campaigns · Donations · Approvals · Refunds · Receipts     │
│  Reconciliation job · TTL job · Fee-bump service                   │
└────┬──────────────────────────┬──────────────────────────┬─────────┘
     │ Soroban RPC (HTTPS)      │ PostgreSQL               │ Service auth
     ▼                          ▼                          ▼
┌─────────────┐      ┌──────────────────┐      ┌──────────────────────┐
│  Stellar    │      │  Database        │      │  apps/verifier       │
│  testnet /  │      │  postgres:16     │      │  (Python, FastAPI)   │
│  mainnet    │      │  (docker-compose)│      │  Evidence assessment │
└─────────────┘      └──────────────────┘      └──────────────────────┘
```

---

## Monorepo layout

```
antioch-app/
  apps/
    web/          Next.js (App Router), TypeScript, Tailwind
    api/          Node.js, Express, TypeScript, Drizzle ORM
    verifier/     Python 3.11+, FastAPI
  packages/
    shared/       Shared Zod schemas, types, amount helpers
    escrow-client/ @antioch/escrow-client (copy from antioch-escrow repo)
  docs/
    spec.md       Full requirements and design
    architecture.md   (this file)
    flows.md      Sequence diagrams
    deployment.md Deployment instructions
  docker-compose.yml
  README.md
```

npm workspaces root. CI runs `lint`, `typecheck`, `test` and `build` across all packages.

---

## Non-custodial design

The server never touches a private key. Every write to the Stellar network follows this pattern:

```
Client                  API                     Stellar
  │                      │                         │
  │── intent + data ────►│                         │
  │                      │── build unsigned XDR    │
  │◄── unsigned XDR ─────│                         │
  │                      │                         │
  │  [user signs in wallet]                        │
  │                      │                         │
  │── submit signed XDR ─────────────────────────►│
  │── report tx hash ───►│                         │
  │                      │── verify on-chain ─────►│
  │                      │◄── confirmed ───────────│
  │                      │── update DB             │
  │◄── success ──────────│                         │
```

---

## Key technical decisions

### One escrow contract per campaign

Each campaign deploys a fresh instance of the `antioch-escrow` WASM. The WASM hash is stored in `ESCROW_WASM_HASH`. The API builds the deploy transaction; a dedicated low-balance platform deployer key (`DEPLOYER_SECRET`) signs only that transaction.

### PostgreSQL only

`docker-compose.yml` and `DATABASE_URL` both target Postgres 16. No MongoDB or other stores.

### Amounts are `i128` stroops

7 decimal places, integer math throughout. `toStroops` / `fromStroops` from `packages/shared` are the only path to convert. Floats are never used for money.

### Expiry is a ledger number

Campaigns have an `expiry_ledger` (not a timestamp). Conversion: `expiry_ledger = currentLedger + Math.ceil(durationSeconds / 5)`. Displayed dates are estimates, clearly labelled.

### Verifier is optional

If `VERIFIER_URL` is unset or the verifier returns `503`, the API proceeds without an assessment. The verifier flags, never approves.

### Fee sponsorship is feature-flagged

`FEE_SPONSOR_ENABLED=false` by default. When enabled, the sponsor wraps eligible transactions in a fee-bump. Caps (per-tx, daily, per-user) are enforced before signing.

---

## packages/escrow-client

A copy of `@antioch/escrow-client` from the [antioch-escrow](https://github.com/eogenyi23-creator/antioch-escrow) repo. It provides:

- XDR builders: `buildFund`, `buildApproveMilestone`, `buildReleaseMilestone`, `buildRefund`
- Read helpers: `readState`, `readFundedTotal`, `readReleasedTotal`, `readMilestone`, `readMilestoneCount`, `readApprovals`, `readDonorContribution`
- Utilities: `toStroops`, `fromStroops`, `decodeError`

The API layer adds: deploy-transaction builder, trustline check. These are not in `escrow-client` because they require the deployer key and Stellar SDK calls beyond what the client library exposes.

---

## Data flow: campaign publish

```
Admin                   API                         Stellar
  │                      │                              │
  │── POST /publish ────►│                              │
  │                      │── build deploy transaction   │
  │                      │   (WASM hash, constructor    │
  │                      │    args from DB)             │
  │                      │── sign with DEPLOYER_SECRET  │
  │                      │── submit ───────────────────►│
  │                      │◄── contract_id ──────────────│
  │                      │── store contract_id in DB    │
  │◄── published ────────│                              │
```

The deployer key is the only server-side signing exception. It never holds user funds.

---

## Reconciliation

A background job runs every ~5 minutes for each active campaign:

1. Fetch latest ledger events from Soroban RPC.
2. Match against pending donations / approvals / releases in the database.
3. Confirm records found on-chain, mark failed records whose transaction is not found after a configurable timeout.

This ensures the database stays consistent even if a user closes the tab after signing.

---

## Error handling

Contract errors are decoded by `decodeError` from `escrow-client` and mapped to the friendly messages in [spec.md §Error codes](spec.md). The web app shows these messages in context (e.g., "Donation would exceed campaign funding cap" inline in the funding widget).
