# StreamFlow Core API v1

Versioned API routes for StreamFlow platform integration.

## Base URL

```
/v1/sessions
```

## Endpoints

### Start Session

**POST** `/v1/sessions/start`

Starts a new payment session for pay-per-second streaming.

**Request Body:**
```json
{
  "viewerAddress": "0x...",
  "creatorAddress": "0x...",
  "ratePerSecond": 0.001
}
```

**Response (201):**
```json
{
  "sessionId": "sf_1234567890_abc123xyz",
  "session": {
    "sessionId": "sf_1234567890_abc123xyz",
    "viewerAddress": "0x...",
    "creatorAddress": "0x...",
    "ratePerSecond": 0.001,
    "startTime": 1234567890000,
    "endTime": null,
    "totalSeconds": 0,
    "totalPaid": 0,
    "status": "active",
    "txHash": null
  },
  "message": "Session started successfully"
}
```

---

### Get Session

**GET** `/v1/sessions/:sessionId`

Retrieves session details by ID.

**Response (200):**
```json
{
  "session": {
    "sessionId": "sf_1234567890_abc123xyz",
    "viewerAddress": "0x...",
    "creatorAddress": "0x...",
    "ratePerSecond": 0.001,
    "startTime": 1234567890000,
    "endTime": null,
    "totalSeconds": 45,
    "totalPaid": 0.045,
    "status": "active",
    "txHash": null
  },
  "currentCost": {
    "seconds": 45,
    "cost": 0.045
  }
}
```

---

### Stop Session

**POST** `/v1/sessions/:sessionId/stop`

Stops an active session and calculates final payment.

**Response (200):**
```json
{
  "sessionId": "sf_1234567890_abc123xyz",
  "session": { ... },
  "totalSeconds": 120,
  "totalPaid": 0.12,
  "message": "Session stopped successfully"
}
```

---

### Prepare Transaction

**POST** `/v1/sessions/:sessionId/prepare-transaction`

Prepares an unsigned transaction for the client to sign.

**Request Body:**
```json
{
  "senderAddress": "0x..."
}
```

**Response (200):**
```json
{
  "unsignedTransactionBcsBase64": "base64...",
  "payTo": "0x...",
  "amount": "12000000",
  "sessionId": "sf_1234567890_abc123xyz",
  "totalSeconds": 120,
  "totalAmount": 0.12
}
```

---

### Settle Session (x402 Protocol)

**POST** `/v1/sessions/:sessionId/settle`

Settles a session payment using x402 protocol.

**Without X-PAYMENT Header - Response (402):**
```json
{
  "scheme": "exact",
  "network": "movement-testnet",
  "maxAmountRequired": "12000000",
  "resource": "/v1/sessions/sf_1234567890_abc123xyz/settle",
  "description": "StreamFlow payment for 120s of streaming",
  "mimeType": "application/json",
  "payTo": "0x...",
  "maxTimeoutSeconds": 600,
  "asset": "MOVE"
}
```

**With Valid X-PAYMENT Header - Response (200):**
```json
{
  "success": true,
  "txHash": "0x...",
  "settledAmount": 0.12,
  "sessionId": "sf_1234567890_abc123xyz",
  "message": "Payment settled successfully"
}
```

---

### List Sessions

**GET** `/v1/sessions`

Lists all sessions with optional filtering.

**Query Parameters:**
- `viewerAddress` (optional): Filter by viewer
- `creatorAddress` (optional): Filter by creator
- `status` (optional): Filter by status (`active`, `stopped`, `settled`)

**Response (200):**
```json
{
  "sessions": [...],
  "count": 10
}
```

---

## Error Responses

All endpoints may return:

**400 Bad Request:**
```json
{
  "error": "Validation failed",
  "details": [...]
}
```

**404 Not Found:**
```json
{
  "error": "Session not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Failed to [action]"
}
```
