export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';
export const STELLAR_NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://stellar.expert/explorer/testnet';

export const RPC_URL =
  STELLAR_NETWORK === 'mainnet'
    ? 'https://soroban-mainnet.stellar.org'
    : 'https://soroban-testnet.stellar.org';

export const NETWORK_PASSPHRASE =
  STELLAR_NETWORK === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';