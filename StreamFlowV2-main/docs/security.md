# Security & Trust Model

## Direct Viewer to Creator Payments

StreamFlow uses a **non-custodial** payment model where funds flow directly from viewer to creator:

```
┌──────────────┐                    ┌──────────────┐
│              │                    │              │
│    Viewer    │ ────── MOVE ─────▶│   Creator    │
│    Wallet    │                    │    Wallet    │
│              │                    │              │
└──────────────┘                    └──────────────┘
        │                                   ▲
        │                                   │
        │   Signs transaction               │   Receives payment
        │   with wallet                     │   directly on-chain
        │                                   │
        ▼                                   │
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                     StreamFlow Server                       │
│                                                             │
│  - Calculates payment amount                                │
│  - Provides creator address                                 │
│  - Verifies transaction on-chain                            │
│  - Never holds or touches funds                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Why This Matters

| Traditional Model | StreamFlow Model |
|-------------------|------------------|
| Platform collects payment | Viewer pays creator directly |
| Platform holds funds | No custodial holding |
| Platform pays out to creators | Instant settlement |
| Platform can withhold funds | Funds never touch platform |
| Regulatory custody requirements | No custody = simpler compliance |

---

## No Custodial Funds

StreamFlow **never holds user funds**:

1. **No Platform Wallet in Payment Path**: The `payTo` address in `PaymentRequirements` is the creator's address, not the platform's.

2. **No Escrow**: Funds transfer directly on settlement. There's no intermediate holding period.

3. **No Access to Private Keys**: The SDK never touches private keys. Signing happens in the user's controlled environment.

4. **Viewer Approval Required**: Every payment requires explicit wallet approval from the viewer.

### Implications

- **No Refunds via Platform**: Since funds go directly to creators, refunds must be handled creator-to-viewer.
- **Instant Finality**: Once settled, the transaction is on-chain and irreversible.
- **Creator Responsibility**: Creators must provide valid wallet addresses.

---

## Server Verification Role

The StreamFlow server performs these security functions:

### 1. Amount Calculation

```typescript
// Server calculates authoritative total
const totalPaid = totalSeconds * ratePerSecond;
```

The server determines how much is owed based on session duration and rate.

### 2. Payment Requirements Generation

```typescript
// Server provides correct recipient and amount
{
  payTo: session.creatorAddress,
  maxAmountRequired: totalInOctas,
}
```

The server ensures the correct creator receives payment.

### 3. On-Chain Verification

```typescript
// Server confirms transaction is on-chain
await aptos.waitForTransaction({ transactionHash });
```

The server verifies the transaction was actually submitted and confirmed.

### 4. Session State Management

```typescript
// Server prevents double-settlement
if (session.status === 'settled') {
  throw new Error('Already settled');
}
```

The server enforces session lifecycle rules.

---

## Amount/Recipient Verification (Future Hardening)

Current implementation verifies that a transaction exists on-chain. Future versions should add:

### Transaction Parsing

```typescript
// Planned enhancement
async function verifyPaymentDetails(txHash: string, expected: {
  recipient: string;
  amount: bigint;
  sender: string;
}): Promise<boolean> {
  const tx = await aptos.getTransactionByHash({ transactionHash: txHash });
  
  // Verify recipient matches creator
  if (tx.payload.arguments[0] !== expected.recipient) {
    throw new Error('Payment sent to wrong address');
  }
  
  // Verify amount matches expected
  if (BigInt(tx.payload.arguments[1]) < expected.amount) {
    throw new Error('Payment amount insufficient');
  }
  
  // Verify sender is the viewer
  if (tx.sender !== expected.sender) {
    throw new Error('Payment from wrong sender');
  }
  
  return true;
}
```

### Why This Matters

Without amount verification, a malicious viewer could:
1. Watch for 1 hour (owes 3.6 MOVE)
2. Submit a transaction for 0.001 MOVE
3. Server sees "transaction confirmed" and marks settled
4. Viewer pays almost nothing

**Current mitigation**: Trust in wallet UI showing correct amounts.

**Future mitigation**: Server-side transaction payload parsing.

---

## Threat Model

### Threats Mitigated

| Threat | Mitigation |
|--------|------------|
| Platform stealing funds | Non-custodial: platform never holds funds |
| Fake sessions | Session must exist in database |
| Double-spending | Session state machine prevents re-settlement |
| Payment to wrong address | Server provides creator address in requirements |
| Man-in-the-middle | HTTPS + on-chain verification |

### Remaining Risks

| Risk | Status | Recommendation |
|------|--------|----------------|
| Underpayment | Open | Add amount verification |
| Wrong sender | Open | Add sender verification |
| Creator key compromise | User responsibility | Use hardware wallets |
| Viewer key compromise | User responsibility | Standard wallet security |
| Session data tampering | Low risk | Database integrity, audit logs |

---

## Best Practices for Integrators

### 1. Validate Addresses

```typescript
// Validate addresses before starting sessions
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}
```

### 2. Rate Limit Session Creation

```typescript
// Prevent session spam
const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 sessions per viewer per minute
});
```

### 3. Monitor Unusual Patterns

- Sessions that never settle
- Unusually high rates
- Same viewer/creator pairs repeatedly
- Failed settlement attempts

### 4. Secure API Access

- Use API authentication for `/v1/*` endpoints
- Implement IP whitelisting for known integrators
- Log all API access for audit

### 5. Protect Environment Variables

- Never commit `PLATFORM_PRIVATE_KEY` to version control
- Use secret management services
- Rotate keys periodically
