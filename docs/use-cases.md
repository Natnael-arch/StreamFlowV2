# Integration Use Cases

## Who Should Use This SDK

StreamFlow is designed for **platforms and developers**, not end users. It provides payment infrastructure that you integrate into your own applications.

### You Should Use StreamFlow If:

- You're building a platform where users pay for time-based access
- You want micropayments without subscription overhead
- You need real-time payment accumulation
- You want direct creator payments without custody
- You're on or planning to use Movement blockchain

### StreamFlow is NOT:

- A streaming platform (build your own, use StreamFlow for payments)
- A consumer wallet app
- A subscription billing system
- A payment processor for one-time purchases

---

## Example Use Cases

### 1. Coaching Apps (Sports, Music, Business)

**Scenario**: Coaches provide 1-on-1 sessions where the user is billed only for the time they are connected and receiving guidance.

```typescript
// When the coaching session (video/audio) starts
const { sessionId } = await streamflow.startSession({
  viewer: clientWallet,
  creator: coachWallet,
  ratePerSecond: 0.05, // e.g., $180/hour
});

// Session runs...
// Cost is calculated and displayed in-app in real-time

// When the session completes
await streamflow.stopSession(sessionId);
await promptPayment(sessionId);
```

**Benefits**:
- **Granular Billing**: Clients pay for the exact minute/second of coaching.
- **Instant Payouts**: Coaches receive funds immediately upon session settlement.
- **Trustless**: No need for the platform to hold funds in escrow.

---

### 2. Study Sessions (Trading Masterclasses, Academic Tutoring)

**Scenario**: High-value knowledge sharing where students pay per second of access to a live expert or study group.

```typescript
// Student joins the trading floor / tutoring room
await startSession({
  viewer: studentWallet,
  creator: expertWallet,
  ratePerSecond: 0.01, // $0.60/minute at $100/MOVE
});

// Session runs...
// Real-time cost displayed to both parties

// Session ends
const payment = await settleSession(sessionId);
// Expert receives payment immediately
```

**Benefits**:
- **No Entry Barrier**: Students can drop in and out of complex trading sessions without a fixed fee.
- **Fair Pricing**: Both parties agree on a time-based rate.
- **Scalable**: Works for 1-on-1 or many-to-1 webinar styles.

---

### 3. Live Performances (Concerts, Street Performers, Digital Busking)

**Scenario**: Virtual stages where viewers pay for the duration they watch a live performance.

```typescript
// When viewer enters the virtual concert
const { sessionId } = await streamflow.startSession(viewerAddress);
startVideoPlayer();
showCostCounter();

// While watching...
// $0.001/second = $3.60/hour

// When viewer leaves the performance
stopVideoPlayer();
const { totalPaid } = await streamflow.stopSession(sessionId);
await promptPayment(sessionId);
```

**Benefits**:
- **Frictionless Support**: Fans can support performers for exactly as long as they stay.
- **Global Reach**: Secure, instant payments from a global audience.
- **Direct Support**: Funds flow directly from the viewer to the artist's wallet.

---

---

## Integration Patterns

### Pattern 1: Frontend-Only (Recommended for Web)

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Your Frontend  │────▶│  StreamFlow API  │────▶│  Movement    │
│  (React, etc.)  │     │  (Hosted)        │     │  Blockchain  │
└─────────────────┘     └──────────────────┘     └──────────────┘
```

Best for: Web apps with wallet extensions (Petra, Nightly)

### Pattern 2: Backend Proxy

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Your App   │────▶│  Your Backend│────▶│  StreamFlow  │────▶│ Movement │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────┘
```

Best for: Mobile apps, custodial wallets, additional business logic

### Pattern 3: SDK Integration

```typescript
import { StreamFlowClient } from '@streamflow/sdk';

// Initialize once
const client = new StreamFlowClient({ ... });

// Use throughout your app
export { client as streamflow };
```

Best for: Any JavaScript/TypeScript application

---

## Not Suitable For

| Use Case | Why Not | Alternative |
|----------|---------|-------------|
| One-time purchases | No time component | Standard payment processors |
| Subscriptions | Fixed recurring billing | Stripe, traditional billing |
| Physical goods | No streaming element | E-commerce platforms |
| High-value transactions | Micropayment focused | Bank transfers |
| Offline payments | Requires connectivity | Store-and-forward systems |
