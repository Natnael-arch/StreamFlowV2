# HTTP API Reference (/v1)

The StreamFlow API is a REST API that manages payment sessions and settlement.

## Base URL

```
https://your-streamflow-instance.com/v1
```

---

## Authentication

API authentication is implementation-specific. Contact your StreamFlow provider for authentication requirements.

---

## Endpoints

### POST /v1/sessions/start

Start a new payment session.

**Request:**

```http
POST /v1/sessions/start
Content-Type: application/json

{
  "viewerAddress": "0x1234...abcd",
  "creatorAddress": "0x5678...efgh",
  "ratePerSecond": 0.001
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `viewerAddress` | string | Yes | Wallet address paying for content |
| `creatorAddress` | string | Yes | Wallet address receiving payment |
| `ratePerSecond` | number | Yes | Cost per second in MOVE |

**Response (201 Created):**

```json
{
  "sessionId": "session_abc123def456",
  "message": "Session started"
}
```

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | Invalid request body |
| 500 | Server error |

---

### GET /v1/sessions/:id

Retrieve session details.

**Request:**

```http
GET /v1/sessions/session_abc123def456
```

**Response (200 OK):**

```json
{
  "sessionId": "session_abc123def456",
  "viewerAddress": "0x1234...abcd",
  "creatorAddress": "0x5678...efgh",
  "ratePerSecond": 0.001,
  "startTime": 1703001600000,
  "endTime": null,
  "totalSeconds": 0,
  "totalPaid": 0,
  "status": "active",
  "txHash": null
}
```

**Errors:**

| Status | Reason |
|--------|--------|
| 404 | Session not found |
| 500 | Server error |

---

### POST /v1/sessions/:id/stop

Stop an active session. Calculates final duration and cost.

**Request:**

```http
POST /v1/sessions/session_abc123def456/stop
```

**Response (200 OK):**

```json
{
  "sessionId": "session_abc123def456",
  "totalSeconds": 300,
  "totalPaid": 0.3,
  "status": "stopped"
}
```

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | Session not active |
| 404 | Session not found |
| 500 | Server error |

---

### POST /v1/sessions/:id/prepare-transaction

Get an unsigned transaction for signing. Use this to build the payment transaction client-side.

**Request:**

```http
POST /v1/sessions/session_abc123def456/prepare-transaction
Content-Type: application/json

{
  "senderAddress": "0x1234...abcd"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `senderAddress` | string | Yes | Viewer's wallet address |

**Response (200 OK):**

```json
{
  "unsignedTransactionBcsBase64": "base64-encoded-transaction...",
  "payTo": "0x5678...efgh",
  "amount": "300000",
  "sessionId": "session_abc123def456",
  "totalSeconds": 300,
  "totalAmount": 0.3
}
```

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | Session not stopped |
| 404 | Session not found |
| 500 | Server error |

---

### POST /v1/sessions/:id/settle

Settle a stopped session. Returns 402 if payment is needed.

**Request (without payment):**

```http
POST /v1/sessions/session_abc123def456/settle
```

**Response (402 Payment Required):**

```json
{
  "scheme": "exact",
  "network": "movement-testnet",
  "maxAmountRequired": "300000",
  "resource": "/v1/sessions/session_abc123def456/settle",
  "description": "Payment for 300 seconds of streaming at 0.001 MOVE/s",
  "mimeType": "application/json",
  "payTo": "0x5678...efgh",
  "maxTimeoutSeconds": 300,
  "asset": "0x1::aptos_coin::AptosCoin"
}
```

**Request (with payment):**

```http
POST /v1/sessions/session_abc123def456/settle
X-PAYMENT: 0xTransactionHash...
```

Or with base64-encoded signed transaction:

```http
POST /v1/sessions/session_abc123def456/settle
X-PAYMENT: base64-encoded-signed-transaction...
```

**Response (200 OK):**

```json
{
  "success": true,
  "txHash": "0x...",
  "settledAmount": 0.3,
  "sessionId": "session_abc123def456",
  "message": "Payment confirmed on Movement testnet"
}
```

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | Session not stopped, or already settled |
| 402 | Payment required (not an error, expected flow) |
| 404 | Session not found |
| 500 | Server error or payment verification failed |

---

### GET /v1/sessions

List sessions with optional filtering.

**Request:**

```http
GET /v1/sessions?viewerAddress=0x1234...&status=settled
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `viewerAddress` | string | Filter by viewer |
| `creatorAddress` | string | Filter by creator |
| `status` | string | Filter by status (active, stopped, settled) |

**Response (200 OK):**

```json
{
  "sessions": [
    {
      "sessionId": "session_abc123def456",
      "viewerAddress": "0x1234...abcd",
      "creatorAddress": "0x5678...efgh",
      "ratePerSecond": 0.001,
      "startTime": 1703001600000,
      "endTime": 1703001900000,
      "totalSeconds": 300,
      "totalPaid": 0.3,
      "status": "settled",
      "txHash": "0x..."
    }
  ]
}
```

---

## 402 PaymentRequirements Schema

When settlement requires payment, the server returns HTTP 402 with this JSON body:

```typescript
interface PaymentRequirements {
  scheme: "exact";                    // Payment must match exactly
  network: string;                    // e.g., "movement-testnet"
  maxAmountRequired: string;          // Amount in smallest units (octas)
  resource: string;                   // The endpoint requiring payment
  description: string;                // Human-readable description
  mimeType: "application/json";       // Response type after payment
  payTo: string;                      // Recipient wallet address
  maxTimeoutSeconds: number;          // Timeout for payment (default: 300)
  asset: string;                      // Token type address
}
```

### Example

```json
{
  "scheme": "exact",
  "network": "movement-testnet",
  "maxAmountRequired": "60000000",
  "resource": "/v1/sessions/session_abc123/settle",
  "description": "Payment for 60 seconds of streaming at 0.01 MOVE/s",
  "mimeType": "application/json",
  "payTo": "0xCreatorAddress123456789abcdef",
  "maxTimeoutSeconds": 300,
  "asset": "0x1::aptos_coin::AptosCoin"
}
```

---

## X-PAYMENT Header Formats

The settle endpoint accepts two formats in the `X-PAYMENT` header:

### Format 1: Transaction Hash

If you've already submitted the transaction to the blockchain:

```
X-PAYMENT: 0x1234567890abcdef...
```

The server will verify the transaction on-chain.

### Format 2: Base64-Encoded Signed Transaction

If you want the server to submit the transaction:

```
X-PAYMENT: eyJzaWduZWRUcmFuc2FjdGlvbiI6...
```

The server will decode, submit, and verify the transaction.

---

## Rate Limits

Rate limits are implementation-specific. Typical defaults:

| Endpoint | Limit |
|----------|-------|
| Start session | 10/minute per viewer |
| Get session | 60/minute |
| Stop session | 10/minute |
| Settle | 10/minute |
| List sessions | 30/minute |

Contact your StreamFlow provider for specific limits.
