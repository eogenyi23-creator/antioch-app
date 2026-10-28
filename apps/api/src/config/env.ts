/**
 * Environment variable loading and validation.
 * Throws at startup if any required variable is missing.
 */

import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const env = {
  // Server
  port: parseInt(optional('PORT', '5000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),

  // Database
  databaseUrl: required('DATABASE_URL'),

  // Auth
  jwtSecret: required('JWT_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '15m'),
  jwtRefreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '7d'),

  // CORS
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:3000'),

  // Stellar
  stellarNetwork: optional('STELLAR_NETWORK', 'testnet') as 'testnet' | 'mainnet',
  sorobanRpcUrl: required('SOROBAN_RPC_URL'),
  networkPassphrase:
    process.env['STELLAR_NETWORK'] === 'mainnet'
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015',

  // Escrow contract
  escrowContractId: optional('ESCROW_CONTRACT_ID', ''),
  escrowWasmHash: required('ESCROW_WASM_HASH'),
  deployerSecret: required('DEPLOYER_SECRET'),

  // Token
  tokenContractId: required('TOKEN_CONTRACT_ID'),
  usdcIssuer: required('USDC_ISSUER'),
  usdcAssetCode: optional('USDC_ASSET_CODE', 'USDC'),

  // Fee sponsorship
  feeSponsorEnabled: optional('FEE_SPONSOR_ENABLED', 'false') === 'true',
  feeSponsorSecret: process.env['FEE_SPONSOR_SECRET'] ?? '',
  feeSponsorMaxPerTx: BigInt(optional('FEE_SPONSOR_MAX_PER_TX_STROOPS', '1000000')),
  feeSponsorMaxPerDay: BigInt(optional('FEE_SPONSOR_MAX_PER_DAY_STROOPS', '100000000')),
  feeSponsorMaxPerUserPerDay: BigInt(
    optional('FEE_SPONSOR_MAX_PER_USER_PER_DAY_STROOPS', '10000000'),
  ),

  // Verifier
  verifierUrl: process.env['VERIFIER_URL'] ?? '',
  serviceAuthKey: process.env['SERVICE_AUTH_KEY'] ?? '',
} as const;
