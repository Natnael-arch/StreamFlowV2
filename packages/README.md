# StreamFlow SDK & Core API

Reusable monetization primitives extracted from the StreamFlow demo.

## Packages

### @streamflow/shared

Pure utilities and types for StreamFlow SDK.

```
packages/streamflow-shared/
  src/
    types.ts     - TypeScript interfaces and types
    pricing.ts   - Cost calculations and MOVE/octa conversions
    session.ts   - Session lifecycle utilities
    x402.ts      - x402 protocol helpers
    index.ts     - Package exports
```

**Key exports:**
- `Session`, `SessionStatus`, `PaymentRequirements` - Types
- `moveToOctas()`, `octasToMove()`, `calculateCost()` - Pricing
- `createSession()`, `stopSession()`, `getSessionCost()` - Session lifecycle
- `createPaymentRequirements()`, `is402Response()` - x402 protocol

### @streamflow/sdk

Client SDK for StreamFlow pay-per-second payments.

```typescript
import { StreamFlowClient, PaymentRequiredError } from '@streamflow/sdk';

const client = new StreamFlowClient({
  apiBaseUrl: 'https://your-api.com',
  creatorAddress: '0x...',
  ratePerSecond: 0.001,
});

// Start a session
await client.startSession({ viewerAddress: '0x...' });

// Track cost updates
client.onCostUpdate((cost) => {
  console.log(`${cost.seconds}s - ${cost.cost} MOVE`);
});

// Stop session
await client.stopSession();

// Handle x402 payment flow
try {
  const receipt = await client.settle();
} catch (error) {
  if (error instanceof PaymentRequiredError) {
    // 1. Get payment requirements
    const requirements = error.requirements;
    
    // 2. Prepare and sign transaction (platform-specific)
    const txData = await client.prepareTransaction();
    const signedTx = await yourWallet.signTransaction(txData);
    
    // 3. Complete settlement with payment header
    const receipt = await client.settle(signedTx.paymentHeader);
  }
}
```

**Features:**
- Framework-agnostic TypeScript
- Automatic cost tracking
- x402 payment flow handling
- Pluggable transport and wallet adapters

## Core API v1

Versioned API routes for platform integration.

See [API.md](./API.md) for full documentation.

**Endpoints:**
- `POST /v1/sessions/start` - Start payment session
- `GET /v1/sessions/:id` - Get session details
- `POST /v1/sessions/:id/stop` - Stop session
- `POST /v1/sessions/:id/prepare-transaction` - Prepare payment tx
- `POST /v1/sessions/:id/settle` - Settle with x402 protocol
- `GET /v1/sessions` - List sessions

## Demo Status

The demo app continues to work unchanged at `/api/session/*` routes.

The SDK and Core API are extracted from demo logic but exposed separately for platform integration.
