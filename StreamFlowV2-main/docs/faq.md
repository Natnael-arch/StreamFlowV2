# FAQ / Common Integration Mistakes

## General Questions

### Why doesn't the SDK sign transactions?

The SDK is intentionally **framework-agnostic**. Wallet signing varies by platform:

| Platform | Signing Method |
|----------|----------------|
| React Web | Aptos Wallet Adapter hooks |
| React Native | Mobile wallet SDKs |
| Node.js | Private key signing |
| Browser Extension | Injected providers |

Including any specific wallet solution would:
- Add unnecessary dependencies
- Break compatibility with other solutions
- Create security concerns (key handling)

Instead, the SDK throws `PaymentRequiredError` with all information needed to sign. You implement signing in your environment.

**See**: [Architecture - Wallet Signing Delegation](./architecture.md#wallet-signing-delegation)

---

### Why am I getting HTTP 402?

HTTP 402 is **expected behavior**, not an error. It means:

1. You called `/settle` without the `X-PAYMENT` header
2. The server is telling you payment is required
3. The response body contains `PaymentRequirements`

**What to do:**
1. Parse the `PaymentRequirements` from the response
2. Build a coin transfer transaction
3. Sign with the viewer's wallet
4. Retry `/settle` with `X-PAYMENT: <signed-tx>` header

**See**: [Payment Flow](./payment-flow.md)

---

### Can I use my own pricing logic?

**Partially.** You control the `ratePerSecond` when starting a session:

```typescript
await client.startSession(viewerAddress, {
  ratePerSecond: calculateMyRate(contentType, creator),
});
```

However, the pricing model is always:
```
Total = Duration (seconds) x Rate Per Second
```

If you need different models (e.g., volume-based, tiered), you would:
1. Use StreamFlow for the time component
2. Implement additional pricing logic in your backend
3. Adjust the rate dynamically if needed

---

### Can this work without crypto UI?

**Yes, with custodial architecture.** If you want to hide crypto from end users:

```typescript
// Your backend handles wallet
async function settleForUser(sessionId: string, userId: string) {
  const userWallet = await getOrCreateWalletForUser(userId);
  
  try {
    await client.settleSession(sessionId);
  } catch (error) {
    if (error instanceof PaymentRequiredError) {
      // Sign with your managed wallet
      const signed = await serverWallet.sign(error.requirements);
      await client.settleSession(sessionId, signed);
    }
  }
}
```

Users see: "Pay $0.36 for 1 hour of streaming"
Backend handles: Wallet creation, funding, signing

---

### What's the minimum payment?

There's no protocol-enforced minimum. However:
- Movement transaction fees apply (~0.001 MOVE per tx)
- Very small payments may have fees larger than the payment itself
- Aggregate multiple sessions if micropayments are too small

---

### How do I handle network issues during settlement?

Settlement is **idempotent**. If the network fails:

1. **Transaction not submitted**: Retry the entire flow
2. **Transaction submitted, confirmation pending**: Retry with same tx hash
3. **Transaction confirmed but response lost**: Session is settled, check status

```typescript
async function robustSettle(sessionId: string, payment: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.settleSession(sessionId, payment);
    } catch (error) {
      if (error.message.includes('already settled')) {
        // Success! Just couldn't confirm last time
        return await client.getSession(sessionId);
      }
      // Retry for network errors
      await sleep(1000 * attempt);
    }
  }
  throw new Error('Settlement failed after retries');
}
```

---

## Common Mistakes

### Mistake 1: Calling settle before stop

```typescript
// WRONG
await client.settleSession(sessionId); // Error: must be stopped first

// CORRECT
await client.stopSession(sessionId);
await client.settleSession(sessionId);
```

---

### Mistake 2: Not handling PaymentRequiredError

```typescript
// WRONG
const result = await client.settleSession(sessionId);
// Crashes with unhandled PaymentRequiredError

// CORRECT
try {
  await client.settleSession(sessionId);
} catch (error) {
  if (error instanceof PaymentRequiredError) {
    // Handle payment flow
  }
}
```

---

### Mistake 3: Using demo payments in production

```typescript
// WRONG (in production)
headers: { 'X-PAYMENT': 'demo_payment_123' }
// Rejected: demo payments not accepted

// CORRECT (in production)
headers: { 'X-PAYMENT': realTransactionHash }
```

---

### Mistake 4: Forgetting to convert amounts

```typescript
// WRONG
const tx = buildTransfer(requirements.payTo, requirements.maxAmountRequired);
// maxAmountRequired is in OCTAS (smallest unit), might be "300000000"

// CORRECT
import { octasToMove } from '@streamflow/shared';
const moveAmount = octasToMove(BigInt(requirements.maxAmountRequired));
// 300000000 octas = 3.0 MOVE
```

---

### Mistake 5: Not checking session status

```typescript
// WRONG
const session = await client.getSession(sessionId);
await client.stopSession(sessionId); // Error if already stopped

// CORRECT
const session = await client.getSession(sessionId);
if (session.status === 'active') {
  await client.stopSession(sessionId);
}
```

---

### Mistake 6: Hardcoding addresses

```typescript
// WRONG
const client = new StreamFlowClient({
  creatorAddress: '0x123...', // Hardcoded
});

// CORRECT
const client = new StreamFlowClient({
  creatorAddress: getCreatorFromContent(contentId),
});
```

---

## Troubleshooting

### "Session not found"

- Check the sessionId format
- Session may have expired or been deleted
- Verify you're hitting the correct API instance

### "Session must be stopped before settlement"

- The session is still `active`
- Call `stopSession()` first, then `settleSession()`

### "Session already settled"

- Payment was already completed
- Check `session.txHash` for the transaction

### "Invalid payment header"

- Payment header format is incorrect
- Must be either:
  - Transaction hash: `0x...` (64 hex chars)
  - Base64 signed transaction

### "Transaction verification failed"

- Transaction doesn't exist on-chain
- Transaction failed or was rejected
- Wrong network (testnet vs mainnet)

### "Insufficient balance"

- Viewer's wallet doesn't have enough MOVE
- Direct user to Movement faucet (testnet) or purchase MOVE

---

## Getting Help

- **Documentation**: You're reading it
- **API Reference**: [api-reference.md](./api-reference.md)
- **Source Code**: Check the SDK implementation
- **Issues**: Report bugs via your support channel
