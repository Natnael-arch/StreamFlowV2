# Architecture Overview

## Component Separation

StreamFlow is organized into three distinct layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEMO APPLICATION                          │
│                   (Reference implementation)                     │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐     │
│  │   React UI  │───▶│  Wallet Hook │───▶│ /api/session/*  │     │
│  │   (Pages)   │    │  (use-x402)  │    │   (Demo Routes) │     │
│  └─────────────┘    └──────────────┘    └────────┬────────┘     │
└──────────────────────────────────────────────────│──────────────┘
                                                   │
                            NOT part of SDK ───────┤
                                                   │
┌──────────────────────────────────────────────────│──────────────┐
│                        SDK LAYER                 ▼              │
│                   (Your integration point)                      │
│  ┌──────────────────┐    ┌─────────────────────────────────┐   │
│  │ streamflow-shared │    │      streamflow-sdk             │   │
│  │  • types.ts      │    │  • StreamFlowClient              │   │
│  │  • pricing.ts    │    │  • PaymentRequiredError          │   │
│  │  • session.ts    │    │  • Framework-agnostic            │   │
│  └──────────────────┘    └─────────────────┬───────────────┘   │
└────────────────────────────────────────────│────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CORE API (/v1)                            │
│                   (Hosted service layer)                         │
│  ┌─────────────────────────┐    ┌────────────────────────────┐  │
│  │    /v1/sessions/*       │───▶│       x402 Module          │  │
│  │  (Versioned Endpoints)  │    │  • Transaction building    │  │
│  └─────────────────────────┘    │  • Payment verification    │  │
│                                 │  • Chain submission        │  │
│  ┌─────────────────────────┐    └──────────────┬─────────────┘  │
│  │    Session Store        │                   │                │
│  │    (PostgreSQL)         │◀──────────────────┘                │
│  └─────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MOVEMENT BLOCKCHAIN                           │
│           https://testnet.movementnetwork.xyz/v1                │
│                       (Bardock Testnet)                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why the SDK Does Not Sign Transactions

The StreamFlow SDK is **intentionally framework-agnostic**. It does not include wallet signing because:

### 1. Wallet Diversity

Different platforms use different wallet solutions:

| Platform | Wallet Solution |
|----------|-----------------|
| React Web | Aptos Wallet Adapter (Petra, Nightly) |
| React Native | Mobile wallet SDKs |
| Node.js Backend | Private key signing |
| Browser Extension | Injected providers |

Including any one solution would:
- Add unnecessary dependencies
- Break compatibility with other solutions
- Increase bundle size

### 2. Security Boundaries

The SDK never touches private keys. Signing happens in your controlled environment:

```typescript
// SDK throws PaymentRequiredError with requirements
try {
  await client.settleSession(sessionId);
} catch (error) {
  if (error instanceof PaymentRequiredError) {
    // YOUR code handles signing
    const signed = await yourWallet.sign(error.requirements);
    await client.settleSession(sessionId, signed);
  }
}
```

### 3. Flexibility

You can implement any signing flow:

- **Hardware wallets**: Ledger, Trezor
- **MPC wallets**: Fireblocks, Copper
- **Smart contract wallets**: Multi-sig, social recovery
- **Custodial**: Backend signing on behalf of users

---

## Wallet Signing Delegation

The SDK delegates signing to integrators via the `PaymentRequiredError` pattern:

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Your App       │     │  SDK Client  │     │  StreamFlow API │
└────────┬────────┘     └──────┬───────┘     └────────┬────────┘
         │                     │                      │
         │  settleSession()    │                      │
         │────────────────────▶│                      │
         │                     │     POST /settle     │
         │                     │─────────────────────▶│
         │                     │                      │
         │                     │     402 + Requirements
         │                     │◀─────────────────────│
         │                     │                      │
         │  PaymentRequiredError                      │
         │◀────────────────────│                      │
         │                     │                      │
         │  [Sign with wallet] │                      │
         │                     │                      │
         │  settleSession(payment)                    │
         │────────────────────▶│                      │
         │                     │  POST /settle        │
         │                     │  X-PAYMENT: ...      │
         │                     │─────────────────────▶│
         │                     │                      │
         │                     │     200 OK           │
         │                     │◀─────────────────────│
         │  Success            │                      │
         │◀────────────────────│                      │
```

---

## Package Structure

### `@streamflow/shared`

Pure utilities with zero dependencies:

```
streamflow-shared/
├── src/
│   ├── types.ts      # TypeScript interfaces
│   ├── pricing.ts    # Cost calculation functions
│   ├── session.ts    # Session lifecycle helpers
│   └── x402.ts       # 402 detection utilities
└── package.json
```

### `@streamflow/sdk`

Framework-agnostic client:

```
streamflow-sdk/
├── src/
│   ├── client.ts     # StreamFlowClient class
│   └── index.ts      # Exports
└── package.json
```

---

## API Versioning

The Core API uses explicit versioning:

| Path | Purpose | Stability |
|------|---------|-----------|
| `/v1/sessions/*` | Production API | Stable, backward-compatible |
| `/api/session/*` | Demo routes | Internal, may change |

When a breaking change is needed, a new version (`/v2/`) will be introduced while `/v1/` continues to work.
