# Demo vs Production Modes

StreamFlow operates in two modes to support development and production use cases.

## Mode Detection

The mode is determined by environment variables:

```typescript
const isProductionMode = 
  !!MOVEMENT_PAY_TO && 
  !!PLATFORM_PRIVATE_KEY && 
  !ACCEPT_DEMO_PAYMENTS;
```

| Condition | Mode |
|-----------|------|
| Missing `MOVEMENT_PAY_TO` | Demo |
| Missing `PLATFORM_PRIVATE_KEY` | Demo |
| `X402_ACCEPT_DEMO_PAYMENTS=true` | Demo |
| All vars set, demo payments disabled | Production |

---

## Demo Mode

### What is Simulated

| Component | Demo Behavior |
|-----------|---------------|
| Session tracking | Real - stored in database |
| Cost calculation | Real - accurate math |
| HTTP 402 responses | Real - returned as expected |
| Payment header validation | Simulated - accepts `demo_*` prefixes |
| Blockchain submission | Skipped - no on-chain transactions |
| Transaction hash | Generated - `demo_tx_*` format |

### How to Use Demo Mode

1. **Don't set production env vars**, or set:
   ```
   X402_ACCEPT_DEMO_PAYMENTS=true
   ```

2. **Use demo payment headers**:
   ```http
   POST /v1/sessions/:id/settle
   X-PAYMENT: demo_payment_abc123
   ```

3. **Receive simulated confirmation**:
   ```json
   {
     "success": true,
     "txHash": "demo_tx_1703001600000_abc123",
     "settledAmount": 0.3,
     "message": "Demo payment accepted"
   }
   ```

### Demo Mode Use Cases

- Local development
- Integration testing
- UI/UX development
- Demos and presentations
- CI/CD pipelines

---

## Production Mode

### What Becomes Real

| Component | Production Behavior |
|-----------|---------------------|
| Session tracking | Real - stored in database |
| Cost calculation | Real - accurate math |
| HTTP 402 responses | Real - returned as expected |
| Payment header validation | Real - verifies on-chain |
| Blockchain submission | Real - submits to Movement |
| Transaction hash | Real - on-chain tx hash |

### Required Environment Variables

```bash
# Wallet address for platform operations (fallback recipient)
MOVEMENT_PAY_TO=0xYourPlatformAddress...

# Private key for server-side operations
PLATFORM_PRIVATE_KEY=0xYourPrivateKey...

# Disable demo payments (optional, defaults to false)
X402_ACCEPT_DEMO_PAYMENTS=false

# Network configuration
MOVEMENT_NETWORK=movement-testnet
MOVEMENT_RPC_URL=https://testnet.movementnetwork.xyz/v1
```

### Production Payment Flow

1. **Viewer's wallet must have MOVE tokens**
2. **Client signs real transaction** (not demo prefix)
3. **Server submits to Movement blockchain**
4. **Server waits for on-chain confirmation**
5. **Real tokens transfer from viewer to creator**

### What Happens Without Wallets

If production mode is enabled but the viewer has no wallet connected:

1. Client calls `/settle` without payment
2. Server returns 402 with real `PaymentRequirements`
3. Client cannot sign transaction without wallet
4. Settlement fails until wallet is connected and funded

---

## Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MOVEMENT_PAY_TO` | Prod | - | Platform wallet address |
| `PLATFORM_PRIVATE_KEY` | Prod | - | Server signing key |
| `X402_ACCEPT_DEMO_PAYMENTS` | No | `true` | Accept demo payments |
| `MOVEMENT_NETWORK` | No | `movement-testnet` | Target network |
| `MOVEMENT_RPC_URL` | No | testnet URL | RPC endpoint |
| `VITE_USE_MOCK_WALLET` | No | `false` | Skip wallet signing (demo only) |

---

## Switching Between Modes

### Development to Production

```bash
# Development (demo mode)
# No special config needed

# Production
export MOVEMENT_PAY_TO="0xYourProductionWallet..."
export PLATFORM_PRIVATE_KEY="0xYourPrivateKey..."
export X402_ACCEPT_DEMO_PAYMENTS="false"
```

### Per-Request Testing

Even in production mode, you can test with demo payments by:

1. Temporarily setting `X402_ACCEPT_DEMO_PAYMENTS=true`
2. Using `demo_*` payment headers
3. Resetting to production after testing

**Note**: Never enable demo payments in a live production environment.

---

## Security Considerations

### Demo Mode

- No real funds at risk
- Safe for public demos
- Do not use for production traffic

### Production Mode

- Real funds transfer on settlement
- Protect `PLATFORM_PRIVATE_KEY`
- Use secure secret management
- Monitor for unusual transaction patterns
- Consider rate limiting to prevent abuse
