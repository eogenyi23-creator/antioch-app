# Security Policy

## Status

Antioch has not had an independent security review, and the escrow contract it uses has not been formally audited. Use testnet unless you have your own review.

## Reporting a vulnerability

Please report vulnerabilities **privately**. Do not open a public issue.

Use GitHub's private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**.

Include:
- a description of the problem and its impact
- steps to reproduce
- the commit or version you tested

## What to expect

- Acknowledgement within a few days
- A fix or a clear explanation as soon as we can manage, and credit to you if you want it
- Please allow time for a fix before disclosing publicly

## Scope

In scope: `apps/web`, `apps/api`, `apps/verifier` and `packages/shared`.
Out of scope: Stellar network issues, wallet bugs, third-party dependencies (report upstream), and the escrow contract (report to [antioch-escrow](https://github.com/eogenyi23-creator/antioch-escrow)).

## Security design in brief

- No private keys are stored or requested.
- The API only builds unsigned transactions and verifies results on-chain.
- Payment endpoints use idempotency keys; a reconciliation job repairs missed confirmations.
- Fee sponsorship, when enabled, signs only a fee-bump wrapper and is limited by spend caps.
- Admin and approver actions are written to an audit log.
