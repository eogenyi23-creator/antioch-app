'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, clearTokens, setTokens, getAccessToken } from '@/lib/api';
import { WalletNetwork, StellarWalletsKit, FreighterModule, xBullModule, AlbedoModule } from '@creit.tech/stellar-wallets-kit';
import { RPC_URL, NETWORK_PASSPHRASE, STELLAR_NETWORK } from '@/lib/config';

interface AuthUser {
  id: string;
  address: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  walletAddress: string | null;
  kit: StellarWalletsKit | null;
  connecting: boolean;
  connectWallet: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJwt(token: string): AuthUser | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const data = JSON.parse(json);
    return { id: data.sub, address: data.address, role: data.role };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [kit, setKit] = useState<StellarWalletsKit | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const network = STELLAR_NETWORK === 'mainnet' ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET;
    const k = new StellarWalletsKit({
      network,
      modules: [new FreighterModule(), new xBullModule(), new AlbedoModule()],
    });
    setKit(k);
  }, []);

  useEffect(() => {
    const at = getAccessToken();
    if (at) {
      const u = decodeJwt(at);
      if (u) setUser(u);
    }
  }, []);

  const connectWallet = useCallback(async () => {
    if (!kit) return;
    setConnecting(true);
    try {
      const { address } = await kit.getAddress();
      setWalletAddress(address);
    } finally {
      setConnecting(false);
    }
  }, [kit]);

  const signIn = useCallback(async () => {
    if (!kit) throw new Error('Wallet not ready');
    if (!walletAddress) {
      const { address } = await kit.getAddress();
      setWalletAddress(address);
    }
    const address = walletAddress ?? (await kit.getAddress()).address;
    setWalletAddress(address);

    // challenge
    const challenge = await apiFetch<{ nonce: string }>(
      '/auth/challenge',
      { method: 'POST', body: JSON.stringify({ stellarAddress: address }) },
    );

    // build auth tx
    const { TransactionBuilder, Memo, Operation, BASE_FEE, rpc } =
      await import('@stellar/stellar-sdk');
    const server = new rpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith('http://') });
    const account = await server.getAccount(address);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(Operation.manageData({ name: 'antioch_auth', value: '1' }))
      .addMemo(Memo.text(challenge.nonce))
      .setTimeout(300)
      .build();

    const signed = await kit.signTransaction(tx.toXDR(), {
      networkPassphrase: NETWORK_PASSPHRASE,
      address,
    });

    const res = await apiFetch<{ accessToken: string; refreshToken: string }>(
      '/auth/verify',
      {
        method: 'POST',
        body: JSON.stringify({ stellarAddress: address, signedXdr: signed.signedTxXdr }),
      },
    );
    setTokens(res.accessToken, res.refreshToken);
    const u = decodeJwt(res.accessToken);
    if (u) setUser(u);
  }, [kit, walletAddress]);

  const signOut = useCallback(() => {
    clearTokens();
    setUser(null);
    setWalletAddress(null);
    apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
  }, []);

  const refreshUser = useCallback(() => {
    const at = getAccessToken();
    if (at) {
      const u = decodeJwt(at);
      if (u) setUser(u);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, walletAddress, kit, connecting, connectWallet, signIn, signOut, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}