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

### 1. Live Streaming Platforms

**Scenario**: Viewers pay creators per second while watching live content.

```typescript
// When viewer clicks "Watch"
const { sessionId } = await streamflow.startSession(viewerAddress);
startVideoPlayer();
showCostCounter();

// While watching
// Cost accumulates: $0.001/second = $3.60/hour

// When viewer clicks "Leave"
stopVideoPlayer();
const { totalPaid } = await streamflow.stopSession(sessionId);
await promptPayment(sessionId);
```

**Benefits**:
- No commitment required from viewers
- Creators earn for actual watch time
- Viewers only pay for what they consume

---

### 2. Study Sessions / Tutoring

**Scenario**: Students pay tutors per minute of live help.

```typescript
// Tutor accepts student request
await startSession({
  viewer: studentWallet,
  creator: tutorWallet,
  ratePerSecond: 0.01, // $0.60/minute at $100/MOVE
});

// Session runs...
// Real-time cost displayed to both parties

// Session ends
const payment = await settleSession(sessionId);
// Tutor receives payment immediately
```

**Benefits**:
- Fair pricing for both parties
- No hourly minimum commitments
- Instant payment to tutors

---

### 3. AI Agent Billing

**Scenario**: AI agents charge per second of compute/response time.

```typescript
// User starts AI conversation
const session = await streamflow.startSession(userWallet);

// AI responds (takes 5 seconds)
const response = await ai.generate(prompt);

// Charge for compute time
await streamflow.stopSession(session.sessionId);
await settleWithAgentWallet(session);
```

**Benefits**:
- Pay for actual compute used
- Transparent pricing
- Automated settlement

---

### 4. Creator Content Gates

**Scenario**: Exclusive content unlocked per second of viewing.

```typescript
// User clicks on premium article/video
if (!isSubscriber) {
  const session = await startPayPerSecondSession();
  
  // Track reading/watching time
  onScroll(() => updateCostDisplay());
  
  // When user leaves
  onBeforeUnload(async () => {
    await settleSession(session);
  });
}
```

**Benefits**:
- Try before you commit
- Pay for what you actually read/watch
- No paywall friction

---

### 5. Metered API Access

**Scenario**: API providers charge per second of usage.

```typescript
// API middleware
app.use('/api/premium', async (req, res, next) => {
  const session = await streamflow.startSession(req.userWallet);
  req.sessionId = session.sessionId;
  
  res.on('finish', async () => {
    await streamflow.stopSession(req.sessionId);
    // Settle or bill later
  });
  
  next();
});
```

**Benefits**:
- Granular usage billing
- No rate limit tiers to manage
- Fair pricing for light users

---

### 6. Virtual Events / Conferences

**Scenario**: Attendees pay per minute of attendance.

```typescript
// User joins event room
joinRoom(eventId);
const session = await streamflow.startSession(attendeeWallet);

// During event
displayRunningCost();

// User leaves or event ends
leaveRoom();
const total = await settleSession(session);
console.log(`Attended for ${total.totalSeconds}s, paid ${total.totalPaid} MOVE`);
```

**Benefits**:
- Pay only for time attended
- No refunds needed for early departure
- Speakers receive proportional payment

---

### 7. Gaming: Play-to-Earn Inverse

**Scenario**: Players pay per second of gameplay, earnings go to game developers or tournament pools.

```typescript
// Game session starts
const session = await streamflow.startSession(playerWallet);
startGame();

// During gameplay
// 0.0001 MOVE/second = ~$0.36/hour

// Game over
endGame();
const { totalPaid } = await settleSession(session);
// Funds go to tournament pool or developer
```

**Benefits**:
- Sustainable game economics
- No upfront game purchase
- Play as long as you want

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
