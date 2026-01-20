import { useWalletContext } from '@/components/providers/aptos-wallet-provider';

export function useWallet() {
  return useWalletContext();
}
