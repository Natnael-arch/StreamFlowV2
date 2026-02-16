import { createContext, useContext, useState, useCallback } from 'react';
import { PrivyProvider as BasePrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';

interface WalletContextValue {
  connected: boolean;
  address: string | null;
  isLoading: boolean;
  connect: () => Promise<string | null>;
  disconnect: () => Promise<void>;
  formatAddress: (addr: string | null) => string;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWalletContext must be used within PrivyProvider');
  }
  return context;
}

interface Props {
  children: React.ReactNode;
}

function PrivyWalletProvider({ children }: Props) {
  const { login, logout, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();

  const activeWallet = wallets[0];
  const address = activeWallet?.address || null;

  const connect = useCallback(async () => {
    login();
    return address;
  }, [login, address]);

  const disconnect = useCallback(async () => {
    logout();
  }, [logout]);

  const formatAddress = useCallback((addr: string | null) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }, []);

  const value: WalletContextValue = {
    connected: authenticated && !!address,
    address,
    isLoading: !ready,
    connect,
    disconnect,
    formatAddress,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

function MockWalletProvider({ children }: Props) {
  const [state, setState] = useState({
    connected: false,
    address: null as string | null,
    isLoading: false,
  });

  const connect = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    await new Promise(resolve => setTimeout(resolve, 500));
    const demoAddress = '0x' + Array(40).fill(0).map(() => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    setState({ connected: true, address: demoAddress, isLoading: false });
    return demoAddress;
  }, []);

  const disconnect = useCallback(async () => {
    setState({ connected: false, address: null, isLoading: false });
  }, []);

  const formatAddress = useCallback((addr: string | null) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }, []);

  const value: WalletContextValue = {
    ...state,
    connect,
    disconnect,
    formatAddress,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function PrivyProvider({ children }: Props) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID;
  const useMockWallet = import.meta.env.VITE_USE_MOCK_WALLET === 'true';
  
  if (useMockWallet) {
    console.log('[Wallet] Using mock wallet (VITE_USE_MOCK_WALLET=true)');
    return <MockWalletProvider>{children}</MockWalletProvider>;
  }
  
  if (!appId) {
    console.warn('Privy App ID not configured. Using demo mode.');
    return <MockWalletProvider>{children}</MockWalletProvider>;
  }

  return (
    <BasePrivyProvider
      appId={appId}
      config={{
        loginMethods: ['wallet', 'email'],
        appearance: {
          theme: 'dark',
          accentColor: '#a855f7',
          showWalletLoginFirst: true,
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      <PrivyWalletProvider>{children}</PrivyWalletProvider>
    </BasePrivyProvider>
  );
}
