# Antioch App — Full Specification

> **Status:** `apps/verifier`, fee sponsorship and PDF receipts are planned and not built yet. See the Roadmap in the README.

> Living document. The Contract facts section wins for the contract interface. Last updated: 2026-10-27.

---


## Product overview

Antioch is a non-custodial giving platform on Stellar. Donors give USDC to missions, scholarships and church projects. Funds are held in a per-campaign Soroban escrow contract and released milestone by milestone after a threshold of independent approvers verify the work. If a campaign expires before all milestones are released, donors reclaim their unspent share. The platform never holds keys or custody.

---

## Contract facts (source of truth)

**Network:** Stellar testnet  
**Soroban RPC:** `https://soroban-testnet.stellar.org`  
**Network passphrase:** `Test SDF Network ; September 2015`

**Showcase escrow (read-only demos/dev):**  
`CDVECNXDBALTJUXWXLHINICDG3V4FNSYZ24IJSKKLESHX323VRII2BHP`  
2-of-3 approvers, two milestones (2,000,000,000 and 3,000,000,000 stroops), first released, second pending.

**Test token (SAC):**  
Contract: `CC6MCT6QYA4O2CEDABD43IL5A3L3ODATL4FZLDGTPOMK3GS4RE5BH67D`  
Asset: `DEMO:GD3GCXWPPA6ZIGQGU6L4QPHVAJZKKJFPN7YFD4YZNKR23XFBNIO4DLR2`  
Token contract ID, asset code and issuer are all env vars. Never hardcode them.

**WASM hash:**  
`dd5492141456f76eb9b6a2371bf4b3386d3eedbe2626274506569eafa1f9ce46`  
Stored in `ESCROW_WASM_HASH`. Used when deploying a new contract instance per campaign.

### Deployment constructor arguments (in order)

```
approvers:      Vec<Address>
threshold:      u32
beneficiary:    Address
token:          Address
milestones:     Vec<i128>
expiry_ledger:  u32
```

One contract instance per campaign. The admin-triggered publish action deploys a new instance from the WASM hash. A dedicated platform deployer key (`DEPLOYER_SECRET`) signs only that deploy transaction and never holds user funds.

### Contract functions

| Function | Auth | Behaviour |
|---|---|---|
| `fund(donor, amount)` | donor | Rejected after expiry, after completion, or if it would push funded total above the sum of all milestones (funding cap). Show remaining fundable amount, block over-cap donations before building XDR. |
| `approve_milestone(approver, index)` | approver | Records approval. On threshold, tries to auto-release in order. If funds are short or prior milestone is unreleased, approval is recorded but milestone stays pending. |
| `release_milestone(index)` | none (anyone) | Releases if threshold met, funds sufficient, prior milestone released. Offer a "Release now" button. |
| `refund(donor)` | donor | Only after expiry, once per donor, pro-rata share of unreleased balance. Returns `i128`. |
| `maintain_ttl(start_index)` | none | Extends storage lifetime. Run from scheduled job for active campaigns with a spend cap. |
| `maintain_donor_ttl(donor)` | none | Extends donor storage lifetime. |

### View functions (read via simulation)

`state()` → `Uninitialized | Active | Completed | Expired`  
`funded_total()`, `released_total()`, `milestone(index)` → `(amount, released)`, `milestone_count()`, `approvals(index)` → `u32`, `donor_contribution(donor)`

### Error codes

| Code | Name | Friendly message |
|---|---|---|
| 1 | NotInitialized | Campaign not initialised |
| 2 | AlreadyInitialized | Campaign already initialised |
| 3 | Unauthorized | You are not authorised for this action |
| 4 | InvalidThreshold | Approval threshold is invalid |
| 5 | DuplicateApprover | Duplicate approver address |
| 6 | InvalidMilestone | Invalid milestone index |
| 7 | AlreadyReleased | Milestone already released |
| 8 | AlreadyApproved | You have already approved this milestone |
| 9 | InsufficientFunds | Contract has insufficient funds |
| 10 | Expired | Campaign has expired |
| 11 | NotExpired | Campaign has not yet expired |
| 12 | NothingToRefund | Nothing to refund for this donor |
| 13 | AmountMustBePositive | Amount must be greater than zero |
| 14 | OutOfOrder | Milestones must be released in order |
| 15 | Overflow | Arithmetic overflow |
| 16 | FundingCapExceeded | Donation would exceed campaign funding cap |
| 17 | ThresholdNotMet | Approval threshold not yet reached |
| 18 | InvalidExpiry | Expiry ledger is invalid |

### Behavioural requirements from contract

- **Expiry is a ledger number, not a timestamp.** Convert campaign end dates: `expiry_ledger = currentLedger + Math.ceil(seconds / 5)`. Display estimated dates by reversing the calculation. Read current ledger from `getLatestLedger`.
- **Milestones release in order.**
- **Beneficiary trustline:** the beneficiary must hold a trustline for the token before the first release succeeds. Check before campaign publishing and before the final approval. Show a clear message.
- **Amounts are `i128` stroops** (7 decimals). Pass `i128` inside lists as strings.
- Funds flow only through released milestones (to beneficiary) or refund (back to donors). Platform never holds funds.

---

## Environment variables

Full list — every variable the codebase touches.

### Web (`NEXT_PUBLIC_*` and server-only)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:5000` | API base URL |
| `NEXT_PUBLIC_STELLAR_NETWORK` | No | `testnet` | `testnet` or `mainnet` |
| `NEXT_PUBLIC_EXPLORER_URL` | No | `https://stellar.expert/explorer/testnet` | Stellar explorer base URL |

### API

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `5000` | API listen port |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | — | Access token secret |
| `JWT_REFRESH_SECRET` | **Yes** | — | Refresh token secret |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin |

### Stellar

| Variable | Required | Description |
|---|---|---|
| `STELLAR_NETWORK` | **Yes** | `testnet` or `mainnet` |
| `SOROBAN_RPC_URL` | **Yes** | Soroban RPC endpoint |
| `ESCROW_CONTRACT_ID` | No | Showcase/demo contract ID (read-only demos); real campaigns each store their own |
| `ESCROW_WASM_HASH` | **Yes** | WASM hash used when deploying new campaign contracts |
| `DEPLOYER_SECRET` | **Yes** | Low-balance platform key that signs deploy transactions only |
| `TOKEN_CONTRACT_ID` | **Yes** | Token SAC contract ID (USDC or test token) |
| `USDC_ISSUER` | **Yes** | USDC issuer address for the chosen network |
| `USDC_ASSET_CODE` | No | `USDC` | Token asset code |

### Fee sponsorship (optional)

| Variable | Required | Default | Description |
|---|---|---|---|
| `FEE_SPONSOR_ENABLED` | No | `false` | Enable platform-paid network fees |
| `FEE_SPONSOR_SECRET` | If sponsoring | — | Fee-bump account secret key |
| `FEE_SPONSOR_MAX_PER_TX_STROOPS` | If sponsoring | — | Per-transaction fee cap |
| `FEE_SPONSOR_MAX_PER_DAY_STROOPS` | If sponsoring | — | Daily fee cap |
| `FEE_SPONSOR_MAX_PER_USER_PER_DAY_STROOPS` | If sponsoring | — | Per-user daily fee cap |

### Verifier (optional)

| Variable | Required | Description |
|---|---|---|
| `VERIFIER_URL` | No | Verifier service URL |
| `SERVICE_AUTH_KEY` | If using verifier | Shared key for API-to-verifier calls |
| `MODEL_API_KEY` | If using hosted model | AI model API key |

### Uploads

| Variable | Required | Description |
|---|---|---|
| `STORAGE_URL` | No | S3-compatible or Cloudinary URL; empty = local `./uploads` in dev |

---

## Architecture

### Monorepo layout

```
antioch-app/
  apps/
    web/          Next.js (App Router), TypeScript, Tailwind, Stellar Wallets Kit
    api/          Node + Express, TypeScript, PostgreSQL, Drizzle ORM
    verifier/     Python, FastAPI, optional AI evidence assessment
  packages/
    shared/       Shared types, Zod schemas, amount helpers (TypeScript)
    escrow-client/ Copy of @antioch/escrow-client from antioch-escrow repo
  docs/
    spec.md       This file
    architecture.md
    flows.md
    deployment.md
  docker-compose.yml
  README.md
  LICENSE
```

Workspaces managed by npm (or pnpm). Root `package.json` defines `workspaces: ["apps/*", "packages/*"]` and root scripts `dev`, `build`, `lint`, `typecheck`, `test`.

### Non-custodial flow (applies to every write operation)

1. Client calls API endpoint with intent.
2. API builds an unsigned XDR transaction.
3. Client presents XDR to the user's wallet (Freighter / xBull / Albedo via Stellar Wallets Kit).
4. User signs.
5. Client submits signed XDR to Stellar.
6. Client reports transaction hash to API.
7. API verifies the transaction on-chain via Soroban RPC before updating any database record.

The server never receives, stores or touches a private key.

### Component responsibilities

**apps/web**
- Next.js App Router, TypeScript, Tailwind CSS.
- Pages: landing, browse, campaign detail, create campaign, applicant dashboard, approver queue, donor dashboard, admin panel.
- Wallet integration via Stellar Wallets Kit (Freighter, xBull, Albedo).
- All Stellar calls go through the API; web never calls Soroban RPC directly except for campaign state reads via `packages/escrow-client`.
- Mobile-first, accessible. Clear loading / error / "waiting for wallet signature" states.
- Never asks users to paste secret keys.

**apps/api**
- Express, TypeScript, Zod.
- Auth: wallet-based challenge (SEP-10-style), JWT access + refresh tokens.
- Roles: donor, applicant/beneficiary, approver, admin.
- Endpoints: campaigns, milestones, evidence, donations (init → submit → verify), approvals, refunds, receipts, exports.
- Background reconciliation job: polls Soroban RPC for contract events and repairs missed confirmations.
- Security: helmet, rate limiting, Zod input validation, request sanitisation, audit log for admin/approver actions.
- OpenAPI docs at `/docs`.
- Feature-flagged fee-bump sponsorship with per-tx, daily and per-user caps.
- Idempotency middleware on payment-like endpoints.

**apps/verifier**
- FastAPI, Python.
- Receives evidence metadata from API (service-auth protected).
- Returns structured assessment: completeness score, consistency with milestone description, confidence score.
- Never approves anything. Only flags doubtful submissions for human approvers.
- If model unavailable, API continues without it (graceful degradation).
- Logs every assessment.

**packages/shared**
- TypeScript.
- `toStroops(amount: string): bigint` and `fromStroops(stroops: bigint): string` — integer math, 7 decimal places.
- Zod schemas for all API request/response bodies.
- Shared role and status enums.
- Tests for amount helpers including 7-decimal edge cases.

**packages/escrow-client**
- Copy of `@antioch/escrow-client` from the `antioch-escrow` repo.
- Exports: `buildFund`, `buildApproveMilestone`, `buildReleaseMilestone`, `buildRefund` (unsigned XDR builders).
- Read helpers: `readState`, `readFundedTotal`, `readReleasedTotal`, `readMilestone`, `readMilestoneCount`, `readApprovals`, `readDonorContribution`.
- `toStroops`, `fromStroops`, `decodeError`.
- The API adds: deploy-transaction builder, trustline check.
- README notes source repo and commit.

---

## Database schema (PostgreSQL 16)

Managed with a migration tool (Drizzle ORM preferred). All timestamps are UTC.

### Tables

**users**
```
id            uuid PK
stellar_address text UNIQUE NOT NULL
role          enum(donor, applicant, approver, admin) NOT NULL DEFAULT donor
display_name  text
created_at    timestamptz
```

**campaigns**
```
id            uuid PK
title         text NOT NULL
story         text NOT NULL
goal_stroops  bigint NOT NULL
approvers     text[] NOT NULL          -- Stellar addresses
threshold     integer NOT NULL
beneficiary   text NOT NULL            -- Stellar address
contract_id   text                     -- set after deploy
expiry_ledger integer
status        enum(draft, published, active, completed, expired)
created_by    uuid FK users
created_at    timestamptz
published_at  timestamptz
```

**milestones**
```
id            uuid PK
campaign_id   uuid FK campaigns
index         integer NOT NULL
title         text NOT NULL
description   text
amount_stroops bigint NOT NULL
released      boolean DEFAULT false
```

**donations**
```
id            uuid PK
idempotency_key text UNIQUE NOT NULL
campaign_id   uuid FK campaigns
donor_id      uuid FK users
amount_stroops bigint NOT NULL
tx_hash       text
status        enum(pending, confirmed, failed)
created_at    timestamptz
confirmed_at  timestamptz
```

**approvals**
```
id            uuid PK
campaign_id   uuid FK campaigns
milestone_index integer NOT NULL
approver_id   uuid FK users
tx_hash       text
created_at    timestamptz
UNIQUE (campaign_id, milestone_index, approver_id)
```

**evidence**
```
id            uuid PK
campaign_id   uuid FK campaigns
milestone_index integer NOT NULL
submitted_by  uuid FK users
notes         text
files         jsonb                   -- [{url, name, mime}]
verifier_assessment jsonb             -- nullable; {completeness, consistency, confidence}
created_at    timestamptz
```

**audit_log**
```
id            uuid PK
actor_id      uuid FK users
action        text NOT NULL
resource_type text
resource_id   text
metadata      jsonb
created_at    timestamptz
```

**fee_sponsor_spend**
```
id            uuid PK
user_id       uuid FK users
date          date NOT NULL
amount_stroops bigint NOT NULL DEFAULT 0
tx_count      integer NOT NULL DEFAULT 0
```

---

## API endpoints

Base path: `/api/v1`  
OpenAPI served at `/docs`.

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/auth/challenge` | Issue SEP-10-style challenge for a Stellar address |
| POST | `/auth/verify` | Verify signed challenge, issue JWT + refresh token |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke refresh token |

### Campaigns

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/campaigns` | Public | List active/completed campaigns |
| GET | `/campaigns/:id` | Public | Campaign detail including on-chain state |
| POST | `/campaigns` | applicant | Draft a campaign |
| PATCH | `/campaigns/:id` | applicant/admin | Update draft |
| POST | `/campaigns/:id/publish` | admin | Deploy escrow, set contract_id, set status=active |
| GET | `/campaigns/:id/transparency` | Public | Full on-chain history |

### Milestones

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/campaigns/:id/milestones` | Public | List milestones with on-chain state |
| POST | `/campaigns/:id/milestones/:index/evidence` | applicant | Submit evidence for a milestone |
| GET | `/campaigns/:id/milestones/:index/evidence` | approver/admin | View evidence + verifier assessment |

### Donations

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/campaigns/:id/donations/init` | donor | Build unsigned fund XDR; idempotency key required |
| POST | `/campaigns/:id/donations/submit` | donor | Record tx hash after signing + submitting |
| POST | `/campaigns/:id/donations/verify` | donor | Force on-chain verification of a specific donation |
| GET | `/campaigns/:id/donations` | admin | List donations for a campaign |
| GET | `/me/donations` | donor | Personal donation history |
| GET | `/me/donations/:id/receipt` | donor | Single receipt (JSON or PDF) |
| GET | `/me/donations/export` | donor | CSV export |

### Approvals

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/campaigns/:id/milestones/:index/approve` | approver | Build unsigned approve_milestone XDR |
| POST | `/campaigns/:id/milestones/:index/approve/submit` | approver | Record approval tx hash |
| POST | `/campaigns/:id/milestones/:index/release` | any authenticated | Build unsigned release_milestone XDR |
| POST | `/campaigns/:id/milestones/:index/release/submit` | any authenticated | Record release tx hash |

### Refunds

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/campaigns/:id/refund/init` | donor | Build unsigned refund XDR |
| POST | `/campaigns/:id/refund/submit` | donor | Record refund tx hash |

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/campaigns` | admin | All campaigns including drafts |
| GET | `/admin/audit-log` | admin | Audit log |
| GET | `/admin/users` | admin | User list |
| PATCH | `/admin/users/:id/role` | admin | Change user role |

---

## Web pages

| Route | Description |
|---|---|
| `/` | Landing: mission statement, featured campaigns, CTA |
| `/campaigns` | Browse active campaigns with search/filter |
| `/campaigns/[id]` | Campaign detail: funding widget, milestone timeline, transparency tab |
| `/campaigns/new` | Create campaign (applicant) |
| `/dashboard/applicant` | Campaign management, evidence submission |
| `/dashboard/approver` | Pending milestones, approve queue |
| `/dashboard/donor` | Donation history, receipts, CSV export, refund buttons |
| `/admin` | Campaign review, user management, audit log |

### Key UI requirements

- **Funding widget:** live progress bar, remaining fundable amount, amount input, "Connect wallet" → "Donate" CTA. Block over-cap amounts before building XDR.
- **Milestone timeline:** each milestone shows amount, status (pending / threshold met / released), approval count vs threshold, "Release now" button if releasable, "Approve" button for eligible approvers.
- **Wallet signature flow:** clear "waiting for wallet signature" state, spinner, timeout, error.
- **Expiry:** show estimated date derived from ledger number, tooltip explaining it's approximate.
- **Trustline warning:** if beneficiary lacks trustline, show actionable message on campaign detail and at milestone threshold.
- **Error messages:** decode contract error codes to friendly strings (from §Contract facts).

---

## Verifier service

**Language:** Python 3.11+, FastAPI.

### Endpoint

`POST /assess` (service-auth header required)

Request:
```json
{
  "campaign_id": "uuid",
  "milestone_index": 0,
  "milestone_description": "...",
  "evidence_notes": "...",
  "evidence_files": [{"name": "...", "mime": "..."}]
}
```

Response:
```json
{
  "completeness": 0.85,
  "consistency": 0.90,
  "confidence": 0.80,
  "flags": ["Missing budget breakdown"],
  "assessed_at": "2026-10-27T22:50:12Z"
}
```

- If model unavailable, return `503` and the API proceeds without the assessment.
- Log every request and response.
- Never approve or block a milestone; that is human approvers' job.

---

## Fee sponsorship

Feature-flagged with `FEE_SPONSOR_ENABLED`. When enabled:

- The sponsor account wraps eligible transactions in a fee-bump.
- Whitelist: only pre-approved transaction types qualify (fund, approve_milestone, release_milestone, refund).
- Caps enforced before signing: per-transaction, daily total, per-user daily.
- Spend tracked in `fee_sponsor_spend` table.
- The fee-bump wrapper cannot move user funds.

---

## Background jobs

**Reconciliation job** (runs every ~5 minutes):
- For each active campaign, fetch contract events from Soroban RPC.
- Compare with database records.
- Confirm pending donations/approvals/releases found on-chain but not yet recorded.
- Mark failed any pending records whose tx is not found after a timeout.

**TTL maintenance job** (runs daily):
- Call `maintain_ttl(0)` on each active campaign.
- Respect a per-day stroop spend cap.

---

## Security requirements

- No private key ever touches the server.
- Helmet middleware, strict CSP.
- Rate limiting on all endpoints; stricter on auth.
- All request bodies validated with Zod.
- Input sanitised before database writes.
- Audit log for every admin and approver action.
- Idempotency keys on donation init, approval and refund init.
- Amount validation: `toStroops` rejects non-numeric, negative, more than 7 decimal places, and overflow.
- Fee sponsorship signs only a fee-bump wrapper.
- DEPLOYER_SECRET signs only deploy transactions; it must be a low-balance account.

---

## Testing requirements

**packages/shared:**
- Unit tests for `toStroops` / `fromStroops`: zero, one unit, max 7 decimals, >7 decimals, negative, overflow.

**apps/api:**
- Unit tests: amount validation, XDR building (mock Soroban RPC), idempotency logic.
- Integration tests: donate flow against testnet with mocked RPC in CI.

**apps/web:**
- Component tests: funding widget (progress bar, over-cap block), milestone timeline.

---

## Build order

1. `packages/shared` — types, schemas, amount helpers, tests.
2. `packages/escrow-client` — copy from source, confirm interface, add deploy builder and trustline check in API.
3. `apps/api` — core, auth, Stellar services, endpoints, reconciliation job.
4. `apps/web` — donation flow, then milestone approval flow.
5. `apps/verifier` — evidence assessment service.
6. Polish: receipts/CSV, TTL job, recurring pledges (stretch), accessibility pass.

---

## Scripts (root `package.json`)

| Command | Purpose |
|---|---|
| `npm run dev` | Start web and API in development (concurrently) |
| `npm run build` | Production build of every app |
| `npm run lint` | Lint and typecheck across all workspaces |
| `npm run typecheck` | TypeScript typecheck across all workspaces |
| `npm test` | Run all tests |

`apps/verifier` scripts (Python):
```bash
ruff check .
pytest
uvicorn main:app --reload --port 8000
```

---

## Commit hygiene

- Small, focused commits: one idea per commit.
