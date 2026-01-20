# Core Concepts

## Sessions

A **session** represents a billable period of usage. Sessions track when a viewer starts consuming content, when they stop, and the total amount owed.

### Session Lifecycle

```
┌─────────┐    start()    ┌─────────┐    stop()     ┌─────────┐   settle()   ┌─────────┐
│ (none)  │ ────────────▶ │ active  │ ────────────▶ │ stopped │ ───────────▶ │ settled │
└─────────┘               └─────────┘               └─────────┘              └─────────┘
                               │                         │
                               │    (real-time cost      │   (total calculated,
                               │     accumulating)       │    payment required)
```

### Session States

| State | Description | Can Transition To |
|-------|-------------|-------------------|
| `active` | User is consuming content, cost accumulating | `stopped` |
| `stopped` | Usage ended, total calculated, awaiting payment | `settled` |
| `settled` | Payment confirmed on-chain | (terminal) |

### Session Data Model

```typescript
interface Session {
  sessionId: string;         // Unique identifier
  viewerAddress: string;     // Wallet paying for content
  creatorAddress: string;    // Wallet receiving payment
  ratePerSecond: number;     // Cost per second in MOVE
  startTime: number;         // Unix timestamp (ms) when started
  endTime: number | null;    // Unix timestamp (ms) when stopped
  totalSeconds: number;      // Duration (set on stop)
  totalPaid: number;         // Final amount (set on stop)
  status: SessionStatus;     // 'active' | 'stopped' | 'settled'
  txHash: string | null;     // On-chain transaction hash (set on settle)
}
```

---

## Rate Per Second Pricing

StreamFlow uses a simple linear pricing model:

```
Total Cost = Duration (seconds) × Rate Per Second
```

### Example

| Duration | Rate | Total |
|----------|------|-------|
| 60 seconds | 0.001 MOVE/s | 0.06 MOVE |
| 5 minutes | 0.001 MOVE/s | 0.30 MOVE |
| 1 hour | 0.001 MOVE/s | 3.60 MOVE |

### Setting Your Rate

The `ratePerSecond` is set when starting a session. Common approaches:

| Use Case | Typical Rate | Notes |
|----------|--------------|-------|
| Casual streaming | 0.0001 MOVE/s | ~$0.01/hour at $100/MOVE |
| Premium content | 0.001 MOVE/s | ~$0.10/hour |
| 1-on-1 sessions | 0.01 MOVE/s | ~$1.00/hour |
| AI API calls | Per-request | Use session for billing period |

---

## Payment Accumulation Model

During an active session, cost accumulates continuously:

```typescript
function calculateCurrentCost(session: Session): number {
  const now = Date.now();
  const seconds = Math.floor((now - session.startTime) / 1000);
  return seconds * session.ratePerSecond;
}
```

### Client-Side Tracking

Platforms typically show a live cost counter to users. This is calculated **client-side** using the session's `startTime` and `ratePerSecond`:

```typescript
// Update every second
setInterval(() => {
  const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
  const cost = elapsed * session.ratePerSecond;
  displayCost(cost);
}, 1000);
```

The server calculates the authoritative total when `stop()` is called.

---

## Settlement via HTTP 402

When a session is stopped, the viewer owes the calculated `totalPaid`. Settlement uses the x402 pattern:

### Step 1: Request Settlement

```http
POST /v1/sessions/{id}/settle
```

### Step 2: Receive Payment Requirements

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "scheme": "exact",
  "network": "movement-testnet",
  "maxAmountRequired": "60000",
  "resource": "/v1/sessions/{id}/settle",
  "description": "Payment for 60 seconds of streaming",
  "payTo": "0xCreatorAddress...",
  "maxTimeoutSeconds": 300,
  "asset": "0x1::aptos_coin::AptosCoin"
}
```

### Step 3: Sign Transaction

The client must:
1. Build a coin transfer transaction
2. Sign it with the viewer's wallet
3. Encode it for the `X-PAYMENT` header

### Step 4: Retry with Payment

```http
POST /v1/sessions/{id}/settle
X-PAYMENT: <base64-encoded-signed-transaction>
```

### Step 5: Confirmation

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "txHash": "0x...",
  "settledAmount": 0.00006,
  "sessionId": "session_abc123",
  "message": "Payment confirmed on Movement testnet"
}
```

---

## Demo Mode vs Production Mode

StreamFlow operates in two modes:

### Demo Mode

- **When**: Missing `MOVEMENT_PAY_TO` or `PLATFORM_PRIVATE_KEY`, or `X402_ACCEPT_DEMO_PAYMENTS=true`
- **Behavior**: Accepts `demo_*` payment headers, no blockchain interaction
- **Use for**: Development, testing, demos

### Production Mode

- **When**: Both env vars set and `X402_ACCEPT_DEMO_PAYMENTS=false`
- **Behavior**: Submits real transactions to Movement testnet/mainnet
- **Use for**: Live applications with real payments

See [Demo vs Production Modes](./modes.md) for detailed configuration.
