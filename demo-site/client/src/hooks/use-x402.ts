import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from './use-wallet';
import type { PaymentRequirements, SettleSessionResponse } from '@shared/schema';
import { MovementClient } from 'streamflow-sdk';

const movementClient = new MovementClient();

interface X402Config {
  network: string;
  asset: string;
  isProductionMode: boolean;
  facilitatorUrl: string;
  payTo: string;
}

interface UseX402Return {
  isReady: boolean;
  isProductionMode: boolean;
  isProcessingPayment: boolean;
  settleSession: (sessionId: string) => Promise<SettleSessionResponse>;
  config: X402Config | null;
}

export function useX402(): UseX402Return {
  const wallet = useWallet();
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const useDemoMode = import.meta.env.VITE_USE_MOCK_WALLET === 'true';

  const { data: config, isLoading: configLoading } = useQuery<X402Config>({
    queryKey: ['/api/x402/config'],
    staleTime: 60000,
  });

  const submitPaymentWithWallet = useCallback(async (
    requirements: PaymentRequirements,
    senderAddress: string,
  ): Promise<string> => {
    // Use wallet adapter's signAndSubmitTransaction (works with any connected wallet)
    if (!wallet.signAndSubmitTransaction) {
      throw new Error('Wallet not connected or does not support signAndSubmitTransaction. Please reconnect your wallet.');
    }

    try {
      // Normalize the payTo address - ensure it's properly formatted
      let normalizedPayTo = requirements.payTo;
      if (!normalizedPayTo.startsWith('0x')) {
        normalizedPayTo = '0x' + normalizedPayTo;
      }

      // Pad to 64 hex chars if needed (Movement addresses)
      const hexPart = normalizedPayTo.slice(2);
      if (hexPart.length < 64) {
        normalizedPayTo = '0x' + hexPart.padStart(64, '0');
      }

      // Build the settlement payload using the SDK's MovementClient
      const sessionId = requirements.resource.split('/').pop() || '';
      const payload = movementClient.getSettlementPayload(
        normalizedPayTo,
        requirements.maxAmountRequired,
        sessionId
      );

      // Submit transaction through wallet adapter
      const result = await wallet.signAndSubmitTransaction(payload);

      // Extract transaction hash from result
      const txHash = result?.hash || result?.args?.hash || (typeof result === 'string' ? result : null);

      if (!txHash) {
        throw new Error('No transaction hash returned from wallet');
      }

      return txHash;
    } catch (error: any) {
      if (error.message?.includes('User rejected') || error.message?.includes('rejected')) {
        throw new Error('Transaction cancelled by user');
      }
      throw new Error(`Payment failed: ${error.message || 'Unknown error'}`);
    }
  }, [wallet]);

  const settleSession = useCallback(async (sessionId: string): Promise<SettleSessionResponse> => {
    setIsProcessingPayment(true);

    try {
      const settleUrl = `/api/session/${sessionId}/settle`;

      // First request - get payment requirements (402)
      const initialResponse = await fetch(settleUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (initialResponse.status !== 402) {
        const data = await initialResponse.json();
        if (!initialResponse.ok) {
          throw new Error(data.error || 'Settlement failed');
        }
        return data as SettleSessionResponse;
      }

      const paymentRequirements = await initialResponse.json() as PaymentRequirements;
      let txHash: string;

      const useDemo = !config?.isProductionMode || useDemoMode;

      if (useDemo) {
        txHash = `demo_tx_${Date.now()}_${sessionId}`;
      } else {
        if (!wallet.connected || !wallet.address) {
          throw new Error('Wallet not connected');
        }
        txHash = await submitPaymentWithWallet(paymentRequirements, wallet.address);
      }

      // Send transaction hash to server to verify and complete settlement
      const confirmResponse = await fetch(settleUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PAYMENT': txHash,
        },
      });

      const result = await confirmResponse.json();

      if (!confirmResponse.ok) {
        throw new Error(result.error || 'Payment confirmation failed');
      }

      return result as SettleSessionResponse;
    } finally {
      setIsProcessingPayment(false);
    }
  }, [config, wallet, submitPaymentWithWallet, useDemoMode]);

  return {
    isReady: !configLoading && !!config,
    isProductionMode: config?.isProductionMode ?? false,
    isProcessingPayment,
    settleSession,
    config: config ?? null,
  };
}
