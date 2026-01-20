import { createContext, useContext, useCallback, useMemo, useState, useEffect, Component, type ErrorInfo, type ReactNode } from 'react';
import {
  AptosWalletAdapterProvider,
  useWallet as useAptosWallet,
} from '@aptos-labs/wallet-adapter-react';
import { Network } from '@aptos-labs/ts-sdk';
import type { AptosSignMessageInput } from '@aptos-labs/wallet-adapter-react';

class WalletErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[Wallet] Provider initialization error:', error.message);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface WalletContextValue {
  connected: boolean;
  address: string | null;
  isLoading: boolean;
  connect: () => Promise<string | null>;
  disconnect: () => Promise<void>;
  formatAddress: (addr: string | null) => string;
  signTransaction: ((payload: any) => Promise<any>) | null;
  signMessage: ((message: AptosSignMessageInput) => Promise<any>) | null;
  signAndSubmitTransaction: ((payload: any) => Promise<any>) | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWalletContext must be used within AptosWalletProvider');
  }
  return context;
}

interface Props {
  children: React.ReactNode;
}

function WalletContextProvider({ children }: Props) {
  const {
    connect: aptosConnect,
    disconnect: aptosDisconnect,
    account,
    connected,
    isLoading,
    signTransaction,
    signMessage,
    signAndSubmitTransaction,
    wallets,
  } = useAptosWallet();

  const address = account?.address?.toString() || null;

  const connect = useCallback(async () => {
    try {
      const availableWallets = wallets?.filter(w => w.readyState === 'Installed');
      if (availableWallets && availableWallets.length > 0) {
        await aptosConnect(availableWallets[0].name);
      } else {
        console.warn('[Wallet] No wallets available. Please install Petra, Pontem, or another Movement-compatible wallet.');
      }
      return address;
    } catch (error) {
      console.error('[Wallet] Connection failed:', error);
      return null;
    }
  }, [aptosConnect, wallets, address]);

  const disconnect = useCallback(async () => {
    try {
      await aptosDisconnect();
    } catch (error) {
      console.error('[Wallet] Disconnect failed:', error);
    }
  }, [aptosDisconnect]);

  const formatAddress = useCallback((addr: string | null) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }, []);

  const value: WalletContextValue = useMemo(() => ({
    connected,
    address,
    isLoading,
    connect,
    disconnect,
    formatAddress,
    signTransaction: connected ? signTransaction : null,
    signMessage: connected ? signMessage : null,
    signAndSubmitTransaction: connected ? signAndSubmitTransaction : null,
  }), [connected, address, isLoading, connect, disconnect, formatAddress, signTransaction, signMessage, signAndSubmitTransaction]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

function WalletInitErrorFallback({ children, error }: { children: ReactNode; error: Error | null }) {
  const [errorShown, setErrorShown] = useState(false);
  
  useEffect(() => {
    if (error && error.message !== 'Network not supported' && !errorShown) {
      console.error('[Wallet] Initialization failed:', error.message);
      setErrorShown(true);
    }
  }, [error, errorShown]);
  
  const fallbackValue: WalletContextValue = useMemo(() => ({
    connected: false,
    address: null,
    isLoading: false,
    connect: async () => {
      const errorMsg = error?.message || 'Wallet initialization failed';
      console.error('[Wallet] Cannot connect:', errorMsg);
      throw new Error(`Cannot connect wallet: ${errorMsg}. Please install Petra or Nightly wallet.`);
    },
    disconnect: async () => {},
    formatAddress: (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '',
    signTransaction: null,
    signMessage: null,
    signAndSubmitTransaction: null,
  }), [error]);

  return (
    <WalletContext.Provider value={fallbackValue}>
      {children}
    </WalletContext.Provider>
  );
}

export function AptosWalletProvider({ children }: Props) {
  const [initError, setInitError] = useState<Error | null>(null);

  if (initError && initError.message !== 'Network not supported') {
    return <WalletInitErrorFallback error={initError}>{children}</WalletInitErrorFallback>;
  }
  
  return (
    <WalletErrorBoundary fallback={<WalletInitErrorFallback error={null}>{children}</WalletInitErrorFallback>}>
      <AptosWalletAdapterProvider
        autoConnect={false}
        dappConfig={{
          network: Network.MAINNET,
          aptosConnect: undefined,
        }}
        optInWallets={['Petra', 'Nightly']}
        onError={(error) => {
          if (error.message === 'Network not supported') {
            console.warn('[Wallet] AptosConnect SDK wallets not supported, using browser extension wallets only');
          } else {
            console.error('[Wallet] Adapter error:', error);
            setInitError(error);
          }
        }}
      >
        <WalletContextProvider>{children}</WalletContextProvider>
      </AptosWalletAdapterProvider>
    </WalletErrorBoundary>
  );
}
