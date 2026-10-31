import { TransactionBuilder, rpc } from '@stellar/stellar-sdk';
import { RPC_URL, NETWORK_PASSPHRASE } from './config';

export async function submitSignedXdr(signedXdr: string): Promise<string> {
  const server = new rpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith('http://') });
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const send = await server.sendTransaction(tx);
  if (send.status === 'ERROR') {
    throw new Error(send.errorResult?.toString() ?? 'Transaction submission failed');
  }
  const hash = send.hash;
  // poll
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const result = await server.getTransaction(hash);
    if (result.status === 'SUCCESS') return hash;
    if (result.status === 'FAILED') {
      throw new Error('Transaction failed on-chain');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Transaction confirmation timeout');
}