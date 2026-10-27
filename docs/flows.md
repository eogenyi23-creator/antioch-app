# Flows

Sequence diagrams for the three core on-chain flows. For full endpoint and contract details see [spec.md](spec.md).

---

## Donate flow

A donor selects an amount and funds a campaign milestone escrow.

```mermaid
sequenceDiagram
    participant D as Donor (browser)
    participant W as Web app
    participant A as API
    participant S as Stellar / Soroban

    D->>W: Connect wallet
    W->>A: GET /campaigns/:id (fetch contract_id, on-chain state)
    A->>S: readFundedTotal, readState (simulation)
    S-->>A: funded_total, state
    A-->>W: campaign + remaining fundable amount

    W->>D: Show funding widget with progress bar and cap

    D->>W: Enter amount (validated ≤ remaining cap)
    W->>A: POST /campaigns/:id/donations/init\n{amount_stroops, idempotency_key}
    A->>S: readFundedTotal (re-check cap)
    A-->>W: unsigned XDR (fund call)

    W->>D: "Waiting for wallet signature..."
    D-->>W: Signed XDR (via Stellar Wallets Kit)

    W->>S: Submit signed transaction
    S-->>W: tx_hash

    W->>A: POST /campaigns/:id/donations/submit\n{idempotency_key, tx_hash}

    note over A: Background reconciliation also picks this up
    A->>S: Verify tx on-chain
    S-->>A: Confirmed (fund event)
    A-->>W: Donation recorded

    W->>D: Show updated progress bar + confirmation
```

**Over-cap guard:** The funding widget reads `funded_total` and the sum of all milestones. If the donor's amount would exceed the cap, the button is disabled and an inline message is shown before XDR is ever built.

---

## Milestone approval flow

An approver reviews evidence and signs an on-chain approval. When the threshold is reached the contract auto-releases (or a "Release now" button appears for anyone to trigger).

```mermaid
sequenceDiagram
    participant B as Beneficiary
    participant Ap as Approver (browser)
    participant W as Web app
    participant A as API
    participant V as Verifier (optional)
    participant S as Stellar / Soroban

    B->>W: Submit milestone evidence\n(notes + files)
    W->>A: POST /campaigns/:id/milestones/:index/evidence
    A->>V: POST /assess (service auth)\n{milestone description, evidence}
    V-->>A: {completeness, consistency, confidence, flags}
    A-->>W: Evidence recorded (with assessment if available)

    note over Ap: Approver receives notification or checks queue

    Ap->>W: Open approver queue
    W->>A: GET /campaigns/:id/milestones/:index/evidence
    A-->>W: Evidence + verifier assessment (flags highlighted)

    Ap->>W: Click "Approve milestone"
    W->>A: POST /campaigns/:id/milestones/:index/approve
    A->>S: Check beneficiary trustline (if this approval reaches threshold)
    A-->>W: unsigned XDR (approve_milestone call)

    W->>Ap: "Waiting for wallet signature..."
    Ap-->>W: Signed XDR

    W->>S: Submit signed transaction
    S-->>W: tx_hash

    W->>A: POST /campaigns/:id/milestones/:index/approve/submit\n{tx_hash}
    A->>S: Verify on-chain
    S-->>A: Confirmed (approve_milestone event)
    A-->>W: Approval recorded, updated approval count

    alt Threshold reached and funds sufficient
        S->>S: auto release_milestone (in contract)
        note over W: Reconciliation job picks up release event
        W->>D: Milestone timeline updated: Released ✓
    else Threshold reached but funds short or prior unreleased
        W->>Ap: Approval recorded, milestone still pending
        W-->>D: Show "Release now" button (visible to anyone)
    end
```

**Beneficiary trustline check:** Before building the approve XDR for the approval that would reach the threshold, the API checks that the beneficiary holds a trustline for the token. If not, it returns a `422` with a message directing the beneficiary to add the trustline.

**Release now:** `release_milestone` is callable by anyone once threshold is met and funds are sufficient. A "Release now" button appears on the campaign detail page for any pending milestone in that state.

---

## Refund flow

After a campaign expires, donors reclaim their pro-rata share of the unreleased balance.

```mermaid
sequenceDiagram
    participant D as Donor (browser)
    participant W as Web app
    participant A as API
    participant S as Stellar / Soroban

    note over S: Campaign expiry_ledger has passed

    D->>W: Open donor dashboard
    W->>A: GET /campaigns/:id (on-chain state)
    A->>S: readState (simulation)
    S-->>A: state = Expired
    A-->>W: Campaign expired, refund available

    W->>D: Show "Reclaim unspent funds" button

    D->>W: Click "Reclaim unspent funds"
    W->>A: POST /campaigns/:id/refund/init
    A->>S: readDonorContribution(donor)\nreadFundedTotal, readReleasedTotal
    A-->>W: unsigned XDR (refund call) + estimated refund amount

    W->>D: "Waiting for wallet signature..."
    D-->>W: Signed XDR

    W->>S: Submit signed transaction
    S-->>W: tx_hash

    W->>A: POST /campaigns/:id/refund/submit\n{tx_hash}
    A->>S: Verify on-chain
    S-->>A: Confirmed (refund event, amount returned)
    A-->>W: Refund recorded

    W->>D: Confirmation with amount and explorer link
```

**Pro-rata calculation (on-chain):** The contract computes the refund as `donor_contribution / funded_total × unreleased_balance`. The API reads this value after the fact via the verified event. The frontend shows an estimate (`donor_contribution - released_share`) before signing.

---

## Campaign publish flow (admin)

```mermaid
sequenceDiagram
    participant Admin
    participant W as Web app
    participant A as API
    participant S as Stellar / Soroban

    Admin->>W: Review draft campaign, click "Publish"
    W->>A: POST /campaigns/:id/publish
    A->>S: Check beneficiary trustline
    A->>A: Build deploy transaction\n(WASM hash, constructor args from DB)
    A->>A: Sign with DEPLOYER_SECRET
    A->>S: Submit deploy transaction
    S-->>A: New contract_id
    A->>A: Store contract_id on campaign, status = active
    A-->>W: Campaign live with contract_id

    W->>Admin: Campaign published ✓
```

The deployer key signs only this transaction. It must hold enough XLM for base reserve + transaction fee, and nothing else.
