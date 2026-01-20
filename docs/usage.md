# SDK Usage Guide

This guide walks through integrating StreamFlow into your application.

## Initialize the Client

```typescript
import { StreamFlowClient } from '@streamflow/sdk';

const client = new StreamFlowClient({
  apiBaseUrl: 'https://your-streamflow-api.com',
  creatorAddress: '0xCreatorWalletAddress...',
  ratePerSecond: 0.001, // MOVE per second
  network: 'movement-testnet',
  asset: '0x1::aptos_coin::AptosCoin',
});
```

### Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiBaseUrl` | string | Yes | Base URL of StreamFlow API |
| `creatorAddress` | string | Yes | Wallet to receive payments |
| `ratePerSecond` | number | Yes | Cost per second in MOVE |
| `network` | string | No | Blockchain network (default: movement-testnet) |
| `asset` | string | No | Token type (default: AptosCoin) |

---

## Start a Session

When a user begins consuming content:

```typescript
// viewerAddress comes from their connected wallet
const viewerAddress = '0xViewerWalletAddress...';

const result = await client.startSession(viewerAddress);
console.log('Session started:', result.sessionId);

// Store sessionId for later use
```

### Response

```typescript
{
  sessionId: "session_abc123...",
  message: "Session started"
}
```

---

## Track Usage Client-Side

Display real-time cost to users. The SDK provides utilities for calculations:

```typescript
import { calculateCost, formatCostWithSymbol } from '@streamflow/shared';

const session = await client.getSession(sessionId);

// Update UI every second
setInterval(() => {
  const { seconds, cost } = calculateCost(
    session.startTime,
    Date.now(),
    session.ratePerSecond
  );
  
  updateUI({
    elapsed: `${seconds}s`,
    currentCost: formatCostWithSymbol(cost, 'MOVE'),
  });
}, 1000);
```

### Available Utilities

```typescript
import {
  calculateCost,           // Real-time cost calculation
  calculateFinalCost,      // Final cost calculation
  formatCost,              // Format to decimal string
  formatCostWithSymbol,    // Format with currency symbol
  moveToOctas,             // Convert MOVE to octas (smallest unit)
  octasToMove,             // Convert octas to MOVE
} from '@streamflow/shared';
```

---

## Stop a Session

When the user finishes:

```typescript
const result = await client.stopSession(sessionId);

console.log('Session stopped');
console.log('Total time:', result.totalSeconds, 'seconds');
console.log('Total owed:', result.totalPaid, 'MOVE');
```

### Response

```typescript
{
  sessionId: "session_abc123...",
  totalSeconds: 300,
  totalPaid: 0.3,
  status: "stopped"
}
```

---

## Handle HTTP 402 PaymentRequiredError

Settlement requires payment. The SDK throws `PaymentRequiredError` when payment is needed:

```typescript
import { StreamFlowClient, PaymentRequiredError } from '@streamflow/sdk';

try {
  // First attempt without payment
  await client.settleSession(sessionId);
} catch (error) {
  if (error instanceof PaymentRequiredError) {
    // Payment is required
    const requirements = error.requirements;
    
    console.log('Payment required:');
    console.log('- Pay to:', requirements.payTo);
    console.log('- Amount:', requirements.maxAmountRequired);
    console.log('- Network:', requirements.network);
    
    // Now sign and retry (see next section)
  } else {
    throw error; // Other errors
  }
}
```

### PaymentRequirements Structure

```typescript
interface PaymentRequirements {
  scheme: string;              // "exact"
  network: string;             // "movement-testnet"
  maxAmountRequired: string;   // Amount in smallest units
  resource: string;            // Endpoint being paid for
  description: string;         // Human-readable description
  payTo: string;               // Recipient wallet address
  maxTimeoutSeconds: number;   // Timeout for payment
  asset: string;               // Token type
}
```

---

## Sign and Submit Payment

This step depends on your wallet integration. Here are examples for common scenarios:

### React with Aptos Wallet Adapter

```typescript
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { PaymentRequiredError } from '@streamflow/sdk';

function PaymentButton({ sessionId }) {
  const { signAndSubmitTransaction, account } = useWallet();
  const client = useStreamFlowClient();

  async function handlePayment() {
    try {
      await client.settleSession(sessionId);
    } catch (error) {
      if (error instanceof PaymentRequiredError) {
        const { payTo, maxAmountRequired } = error.requirements;
        
        // Build and sign the transaction
        const result = await signAndSubmitTransaction({
          data: {
            function: '0x1::aptos_account::transfer_coins',
            typeArguments: ['0x1::aptos_coin::AptosCoin'],
            functionArguments: [payTo, maxAmountRequired],
          },
        });
        
        // Retry settlement with the transaction hash
        await client.settleSession(sessionId, result.hash);
      }
    }
  }

  return <button onClick={handlePayment}>Pay Now</button>;
}
```

### Backend with Private Key

```typescript
import { Aptos, AptosConfig, Network, Account } from '@aptos-labs/ts-sdk';

const config = new AptosConfig({ network: Network.CUSTOM });
const aptos = new Aptos(config);

async function settleWithPrivateKey(sessionId: string, privateKey: string) {
  const client = new StreamFlowClient({ /* config */ });
  
  try {
    await client.settleSession(sessionId);
  } catch (error) {
    if (error instanceof PaymentRequiredError) {
      const { payTo, maxAmountRequired } = error.requirements;
      
      const signer = Account.fromPrivateKey({ privateKey });
      
      const tx = await aptos.transaction.build.simple({
        sender: signer.accountAddress,
        data: {
          function: '0x1::aptos_account::transfer_coins',
          typeArguments: ['0x1::aptos_coin::AptosCoin'],
          functionArguments: [payTo, BigInt(maxAmountRequired)],
        },
      });
      
      const signedTx = await aptos.signAndSubmitTransaction({
        signer,
        transaction: tx,
      });
      
      await client.settleSession(sessionId, signedTx.hash);
    }
  }
}
```

---

## Retry Settlement with X-PAYMENT Header

After signing, retry the settlement:

```typescript
// With transaction hash
await client.settleSession(sessionId, '0xTransactionHash...');

// Or with full signed transaction (base64)
await client.settleSession(sessionId, base64SignedTransaction);
```

### Success Response

```typescript
{
  success: true,
  txHash: "0x...",
  settledAmount: 0.3,
  sessionId: "session_abc123...",
  message: "Payment confirmed on Movement testnet"
}
```

---

## Complete Integration Example

```typescript
import { StreamFlowClient, PaymentRequiredError } from '@streamflow/sdk';
import { calculateCost } from '@streamflow/shared';

class StreamingService {
  private client: StreamFlowClient;
  private activeSession: string | null = null;

  constructor(apiUrl: string, creatorAddress: string) {
    this.client = new StreamFlowClient({
      apiBaseUrl: apiUrl,
      creatorAddress,
      ratePerSecond: 0.001,
    });
  }

  async startWatching(viewerAddress: string): Promise<void> {
    const result = await this.client.startSession(viewerAddress);
    this.activeSession = result.sessionId;
    this.startCostTracker();
  }

  async stopWatching(): Promise<number> {
    if (!this.activeSession) throw new Error('No active session');
    
    const result = await this.client.stopSession(this.activeSession);
    return result.totalPaid;
  }

  async pay(signTransaction: (req: any) => Promise<string>): Promise<string> {
    if (!this.activeSession) throw new Error('No active session');
    
    try {
      const result = await this.client.settleSession(this.activeSession);
      return result.txHash!;
    } catch (error) {
      if (error instanceof PaymentRequiredError) {
        const txHash = await signTransaction(error.requirements);
        const result = await this.client.settleSession(this.activeSession, txHash);
        this.activeSession = null;
        return result.txHash!;
      }
      throw error;
    }
  }

  private startCostTracker(): void {
    // Implementation depends on your UI framework
  }
}
```

---

## Error Handling

```typescript
import { PaymentRequiredError } from '@streamflow/sdk';

try {
  await client.settleSession(sessionId);
} catch (error) {
  if (error instanceof PaymentRequiredError) {
    // Expected: need to sign and pay
  } else if (error.message.includes('Session not found')) {
    // Invalid session ID
  } else if (error.message.includes('already settled')) {
    // Session was already paid
  } else if (error.message.includes('must be stopped')) {
    // Need to stop session first
  } else {
    // Network or other error
    console.error('Settlement failed:', error);
  }
}
```
