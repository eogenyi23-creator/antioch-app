# Deployment

Instructions for deploying Antioch to production. For local development see the root [README.md](../README.md).

---

## Prerequisites

- Node.js 20+ and npm
- Python 3.11+ (verifier only)
- A deployed `antioch-escrow` contract — see [antioch-escrow](https://github.com/eogenyi23-creator/antioch-escrow) for its deploy script
- A PostgreSQL 16 database (Supabase, Neon, Render Postgres, or self-hosted)
- A low-balance Stellar account for the platform deployer key (`DEPLOYER_SECRET`)

---

## Testnet vs mainnet

All environment variables that differ between networks:

| Variable | Testnet | Mainnet |
|---|---|---|
| `STELLAR_NETWORK` | `testnet` | `mainnet` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` | `mainnet` |
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Horizon/Soroban mainnet endpoint |
| `NEXT_PUBLIC_EXPLORER_URL` | `https://stellar.expert/explorer/testnet` | `https://stellar.expert/explorer/public` |
| `USDC_ISSUER` | Testnet USDC issuer or test token issuer | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| `USDC_ASSET_CODE` | `DEMO` (test) or `USDC` | `USDC` |
| `TOKEN_CONTRACT_ID` | Test token SAC contract | Mainnet USDC SAC contract |
| `ESCROW_WASM_HASH` | Hash of testnet-deployed WASM | Hash of mainnet-deployed WASM |

**Never deploy to mainnet without an independent contract audit.** The SECURITY.md and README both carry this warning.

---

## Web — Vercel

1. Import the repository into Vercel. Set the root directory to `apps/web`.
2. Set the framework to **Next.js**.
3. Add all `NEXT_PUBLIC_*` environment variables in the Vercel project settings.
4. Deploy. Vercel rebuilds on every push to `main`.

```bash
# One-time Vercel CLI deploy
cd apps/web
npx vercel --prod
```

Environment variables to set in Vercel:

```
NEXT_PUBLIC_API_URL=https://your-api.onrender.com
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_EXPLORER_URL=https://stellar.expert/explorer/testnet
```

---

## API — Render

1. Create a new **Web Service** on Render. Point it to `apps/api`.
2. Build command: `npm install && npm run build`
3. Start command: `node dist/index.js`
4. Add all environment variables (see `.env.example`).

Key environment variables:

```
PORT=5000
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
CORS_ORIGIN=https://your-web.vercel.app
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
ESCROW_WASM_HASH=dd5492141456f76eb9b6a2371bf4b3386d3eedbe2626274506569eafa1f9ce46
DEPLOYER_SECRET=...
TOKEN_CONTRACT_ID=CC6MCT6QYA4O2CEDABD43IL5A3L3ODATL4FZLDGTPOMK3GS4RE5BH67D
USDC_ISSUER=GD3GCXWPPA6ZIGQGU6L4QPHVAJZKKJFPN7YFD4YZNKR23XFBNIO4DLR2
USDC_ASSET_CODE=DEMO
FEE_SPONSOR_ENABLED=false
```

### Database migrations

Run migrations before the first deploy and after any schema change:

```bash
npm run db:migrate --workspace=apps/api
```

The migration tool (Drizzle) reads `DATABASE_URL` from the environment.

---

## Verifier — Render (optional)

1. Create a new **Web Service** on Render. Set the root to `apps/verifier`.
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port 8000`
4. Set environment variables:

```
SERVICE_AUTH_KEY=...
MODEL_API_KEY=...   # if using a hosted model
```

In the API environment, set:

```
VERIFIER_URL=https://your-verifier.onrender.com
SERVICE_AUTH_KEY=...   # same value
```

The API will work without the verifier if `VERIFIER_URL` is unset.

---

## Database — PostgreSQL 16

### Managed options

- **Supabase** (generous free tier, supports `pgdata` extensions)
- **Neon** (serverless, good for low-traffic testnet use)
- **Render Postgres** (keep API and DB in the same region)

Set `DATABASE_URL` to the connection string provided by your provider.

### Self-hosted (Docker)

```bash
docker compose up -d
```

This starts `postgres:16` with user/pass/db `antioch` on port `5432`, matching the `DATABASE_URL` in `.env.example`.

---

## File storage — uploads

Set `STORAGE_URL` to an S3-compatible endpoint or a Cloudinary URL for evidence uploads. Leave it empty in development to use the local `./uploads` directory.

Example (S3):

```
STORAGE_URL=s3://your-bucket?region=us-east-1&accessKeyId=...&secretAccessKey=...
```

---

## DEPLOYER_SECRET — platform deployer account

The platform deployer is a low-balance Stellar account used only to sign campaign deploy transactions. Set it up once:

1. Generate a new Stellar keypair (use the Stellar Laboratory or `stellar-sdk`'s `Keypair.random()`).
2. Fund with the minimum XLM: base reserve (1 XLM) + a small fee buffer (a few XLM).
3. Store the secret key in `DEPLOYER_SECRET`. Never add it to source control.
4. The deployer account should hold nothing else. It does not hold user funds.

---

## Health checks

- API: `GET /health` returns `200 OK` with current timestamp and database connectivity.
- Verifier: `GET /health` returns `200 OK`.

Configure these as health checks in Render so it restarts on failure.

---

## Monitoring

- Enable Render's built-in log streaming.
- The API writes structured JSON logs. Filter on `level=error` for alerts.
- The audit log table in PostgreSQL records every admin and approver action.

---

## First deploy checklist

- [ ] Postgres 16 database created and `DATABASE_URL` set
- [ ] Migrations run successfully
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` are long random strings (not the defaults)
- [ ] `DEPLOYER_SECRET` is a funded low-balance Stellar account
- [ ] `ESCROW_WASM_HASH` matches the deployed antioch-escrow contract
- [ ] `TOKEN_CONTRACT_ID`, `USDC_ISSUER`, `USDC_ASSET_CODE` point to the correct network
- [ ] `CORS_ORIGIN` matches the web app URL
- [ ] `FEE_SPONSOR_ENABLED=false` unless you have explicitly set up fee sponsorship
- [ ] Web app `NEXT_PUBLIC_API_URL` points to the live API
- [ ] Health check endpoints respond on both API and verifier
- [ ] Tested the full donate flow on testnet before switching to mainnet
