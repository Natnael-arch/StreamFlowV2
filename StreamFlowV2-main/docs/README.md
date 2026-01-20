# StreamFlow SDK Documentation

Real-time payment infrastructure for pay-per-second streaming on Movement blockchain.

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](./concepts.md)
3. [Architecture](./architecture.md)
4. [SDK Installation](./installation.md)
5. [SDK Usage Guide](./usage.md)
6. [HTTP API Reference](./api-reference.md)
7. [Payment Flow (x402)](./payment-flow.md)
8. [Demo vs Production Modes](./modes.md)
9. [Security & Trust Model](./security.md)
10. [Integration Use Cases](./use-cases.md)
11. [FAQ](./faq.md)

---

## Overview

### What is StreamFlow?

StreamFlow is **real-time payment infrastructure** for applications that need to charge users by the second. It is not a streaming platform itself—it is the payment layer that streaming platforms, creator apps, and AI services integrate to enable pay-per-use billing.

StreamFlow uses the **x402 protocol** (HTTP 402 Payment Required) to create a standardized payment flow where:

1. Users start a session
2. Costs accumulate in real-time
3. When the session ends, the server requests payment via HTTP 402
4. The client signs and submits a blockchain transaction
5. The server verifies on-chain settlement

### What Problems Does StreamFlow Solve?

| Problem | StreamFlow Solution |
|---------|---------------------|
| Subscriptions waste money on unused time | Pay only for seconds watched |
| Payment processors take large cuts | Direct blockchain transfers to creators |
| Complex billing integration | Simple SDK with HTTP 402 standard |
| Micropayments are impractical | Aggregate to single settlement per session |
| Trust issues with platforms holding funds | Non-custodial, viewer pays creator directly |

### Why HTTP 402 (x402)?

HTTP 402 ("Payment Required") has existed since HTTP/1.1 but lacked a standard implementation. The x402 protocol fills this gap:

```
Client: POST /v1/sessions/{id}/settle
Server: 402 Payment Required
        { payTo, amount, network, asset, ... }

Client: [Signs transaction with wallet]

Client: POST /v1/sessions/{id}/settle
        X-PAYMENT: <signed-transaction>
Server: 200 OK
        { txHash, settled: true }
```

This pattern is:
- **Standard**: Works with any HTTP client
- **Explicit**: Payment requirements are machine-readable
- **Verifiable**: Settlement is confirmed on-chain
- **Framework-agnostic**: No dependency on React, mobile SDKs, etc.

### Payment Flow: Viewer to Creator

StreamFlow payments flow **directly from viewer to creator**:

```
┌──────────┐                      ┌──────────┐
│  Viewer  │ ────── MOVE ──────▶ │ Creator  │
│  Wallet  │                      │  Wallet  │
└──────────┘                      └──────────┘
      │                                 ▲
      │                                 │
      ▼                                 │
┌─────────────────────────────────────────────┐
│              StreamFlow API                 │
│  (Calculates amount, verifies settlement)   │
└─────────────────────────────────────────────┘
```

The platform never holds or touches funds. This:
- Eliminates custody risk
- Reduces regulatory burden
- Builds user trust
- Simplifies accounting for creators

---

## Quick Start

### For Platform Developers

```typescript
import { StreamFlowClient, PaymentRequiredError } from '@streamflow/sdk';

const client = new StreamFlowClient({
  apiBaseUrl: 'https://your-streamflow-instance.com',
  creatorAddress: '0x123...abc',
  ratePerSecond: 0.001, // 0.001 MOVE per second
});

// Start a session when user begins watching
const { sessionId } = await client.startSession('0xViewerWallet...');

// Later: stop when user finishes
const { totalPaid } = await client.stopSession(sessionId);

// Settle payment (handles 402 flow)
try {
  await client.settleSession(sessionId);
} catch (error) {
  if (error instanceof PaymentRequiredError) {
    // Sign and submit transaction with your wallet integration
    const signedTx = await yourWallet.signTransaction(error.requirements);
    await client.settleSession(sessionId, signedTx);
  }
}
```

### For API-Only Integration

```bash
# Start session
curl -X POST https://api.streamflow.example/v1/sessions/start \
  -H "Content-Type: application/json" \
  -d '{"viewerAddress":"0x...","creatorAddress":"0x...","ratePerSecond":0.001}'

# Stop session
curl -X POST https://api.streamflow.example/v1/sessions/{id}/stop

# Settle (will return 402)
curl -X POST https://api.streamflow.example/v1/sessions/{id}/settle
# Response: 402 with PaymentRequirements

# Settle with payment
curl -X POST https://api.streamflow.example/v1/sessions/{id}/settle \
  -H "X-PAYMENT: <base64-signed-transaction>"
```

---

## Network Information

| Property | Value |
|----------|-------|
| Blockchain | Movement |
| Testnet | Bardock |
| Chain ID | 250 |
| RPC URL | `https://testnet.movementnetwork.xyz/v1` |
| Faucet | `https://faucet.testnet.movementnetwork.xyz/` |
| Asset | MOVE (native token) |

---

## Next Steps

- [Core Concepts](./concepts.md) - Understand sessions, pricing, and settlement
- [SDK Usage Guide](./usage.md) - Step-by-step integration walkthrough
- [API Reference](./api-reference.md) - Complete endpoint documentation
- [FAQ](./faq.md) - Common questions and troubleshooting
