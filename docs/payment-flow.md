# Payment Flow (x402)

## Why HTTP 402 is Returned

HTTP 402 "Payment Required" signals that a resource requires payment before access. StreamFlow uses this for settlement:

1. **Standard HTTP**: Works with any HTTP client without special libraries
2. **Machine-Readable**: `PaymentRequirements` can be automatically parsed
3. **Explicit**: Clear separation between "need payment" and "error"
4. **Idempotent**: Safe to retry with payment header

Unlike traditional payment flows (redirects to payment pages), x402 keeps everything in the API layer.

---

## What PaymentRequirements Contain

When you call `/v1/sessions/:id/settle` without payment, you receive:

```json
{
  "scheme": "exact",
  "network": "movement-testnet",
  "maxAmountRequired": "300000000",
  "resource": "/v1/sessions/session_abc123/settle",
  "description": "Payment for 300 seconds of streaming at 0.001 MOVE/s",
  "mimeType": "application/json",
  "payTo": "0xCreatorWalletAddress...",
  "maxTimeoutSeconds": 300,
  "asset": "0x1::aptos_coin::AptosCoin"
}
```

| Field | Purpose |
|-------|---------|
| `scheme` | Payment matching mode ("exact" = must match amount) |
| `network` | Blockchain network for payment |
| `maxAmountRequired` | Payment amount in smallest units (octas) |
| `resource` | Endpoint to retry after payment |
| `description` | Human-readable explanation |
| `mimeType` | Response format after successful payment |
| `payTo` | Recipient wallet address (the creator) |
| `maxTimeoutSeconds` | How long the payment offer is valid |
| `asset` | Token type for payment |

---

## How Clients Should React

### Step-by-Step Flow

```
1. Call POST /v1/sessions/:id/settle
   └── Receive 402 with PaymentRequirements

2. Extract payment details:
   - payTo: Where to send funds
   - maxAmountRequired: How much (in octas)
   - asset: Which token

3. Build a coin transfer transaction:
   - From: Viewer's wallet
   - To: payTo address
   - Amount: maxAmountRequired
   - Type: asset

4. Sign the transaction with viewer's wallet

5. Either:
   a. Submit to blockchain, get txHash, call /settle with X-PAYMENT: txHash
   OR
   b. Call /settle with X-PAYMENT: base64(signedTransaction)

6. Receive 200 OK with settlement confirmation
```

### Code Example

```typescript
async function handleSettlement(sessionId: string): Promise<string> {
  // Step 1: Try to settle
  const response = await fetch(`/v1/sessions/${sessionId}/settle`, {
    method: 'POST',
  });

  // Step 2: Check for 402
  if (response.status === 402) {
    const requirements = await response.json();
    
    // Step 3 & 4: Build and sign transaction
    const txHash = await wallet.signAndSubmitTransaction({
      function: '0x1::aptos_account::transfer_coins',
      typeArguments: [requirements.asset],
      arguments: [requirements.payTo, requirements.maxAmountRequired],
    });
    
    // Step 5: Retry with payment
    const settleResponse = await fetch(`/v1/sessions/${sessionId}/settle`, {
      method: 'POST',
      headers: {
        'X-PAYMENT': txHash,
      },
    });
    
    // Step 6: Get confirmation
    const result = await settleResponse.json();
    return result.txHash;
  }
  
  // Already settled or error
  return (await response.json()).txHash;
}
```

---

## How Settlement is Verified On-Chain

When the server receives the `X-PAYMENT` header, it performs verification:

### If X-PAYMENT is a Transaction Hash (0x...)

```
1. Query blockchain for transaction status
2. Wait for confirmation (aptos.waitForTransaction)
3. Verify transaction exists and is confirmed
4. Mark session as settled with txHash
```

### If X-PAYMENT is Base64-Encoded Transaction

```
1. Decode base64 to raw bytes
2. Deserialize transaction and authenticator
3. Submit to blockchain (POST /transactions)
4. Wait for confirmation
5. Mark session as settled with resulting txHash
```

### Verification Checks

The server currently verifies:
- Transaction is confirmed on-chain
- Transaction did not fail

Future enhancements may add:
- Amount matches expected payment
- Recipient matches expected creator
- Sender matches session viewer

---

## Sequence Diagram

```
┌──────────┐          ┌──────────────┐          ┌────────────┐
│  Client  │          │  StreamFlow  │          │ Movement   │
└────┬─────┘          └──────┬───────┘          └─────┬──────┘
     │                       │                        │
     │ POST /settle          │                        │
     │──────────────────────▶│                        │
     │                       │                        │
     │ 402 PaymentRequirements                        │
     │◀──────────────────────│                        │
     │                       │                        │
     │ [Build Transaction]   │                        │
     │                       │                        │
     │ [Sign with Wallet]    │                        │
     │                       │                        │
     │                       │    Submit Transaction  │
     │                       │───────────────────────▶│
     │                       │                        │
     │                       │    Transaction Hash    │
     │                       │◀───────────────────────│
     │                       │                        │
     │ POST /settle          │                        │
     │ X-PAYMENT: hash       │                        │
     │──────────────────────▶│                        │
     │                       │                        │
     │                       │    Verify on-chain     │
     │                       │───────────────────────▶│
     │                       │                        │
     │                       │    Confirmed           │
     │                       │◀───────────────────────│
     │                       │                        │
     │ 200 OK                │                        │
     │ { success, txHash }   │                        │
     │◀──────────────────────│                        │
     │                       │                        │
```

---

## Error Cases

| Scenario | HTTP Status | Resolution |
|----------|-------------|------------|
| Session not stopped | 400 | Call `/stop` first |
| Session already settled | 400 | No action needed |
| Invalid transaction hash | 500 | Check transaction format |
| Transaction not found | 500 | Wait and retry, or re-submit |
| Transaction failed | 500 | Build new transaction |
| Timeout waiting for confirmation | 500 | Retry with same hash |
