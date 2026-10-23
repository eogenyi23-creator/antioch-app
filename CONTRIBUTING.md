# Contributing to Antioch

Thanks for helping. This app handles other people's donations, so we prefer small, well-tested changes.

## Before you start

- Open an issue (or comment on one) before starting substantial work.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.
- The smart contract lives in [antioch-escrow](https://github.com/eogenyi23-creator/antioch-escrow). Contract changes belong there.

## Setup

```bash
git clone https://github.com/eogenyi23-creator/antioch-app.git
cd antioch-app
npm install
cp .env.example .env      # fill in the values
docker compose up -d      # database
npm run dev
```

Verifier (optional):

```bash
cd apps/verifier
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Workflow

1. Fork and branch from `main` (`feat/refund-button`, `fix/amount-validation`).
2. Make your change with tests.
3. Run the checks below.
4. Open a pull request against `main` and fill in the template.

## Checks that must pass

```bash
npm run lint
npm run typecheck
npm test
npm run build
# verifier
cd apps/verifier && ruff check . && pytest
```

CI runs the same commands.

## Standards

- **Money:** use the shared amount helpers. Strict 7-decimal USDC, integer stroop math, never floats.
- **Keys:** never store, log or request a user's secret key. Users sign in their own wallets.
- **Stellar writes:** the API builds unsigned transactions only. Verify on-chain before updating records.
- **Payment endpoints** must accept an idempotency key.
- **Validation:** validate every request body with the shared Zod schemas.
- **Verifier:** it may flag evidence but never approves a milestone.
- Every bug fix includes a test that fails without the fix.

## Commit messages

Short, imperative, one idea per commit: `Add idempotency key to donation init`.

## Code of conduct

Be respectful and assume good faith. Harassment or abuse is not tolerated.
