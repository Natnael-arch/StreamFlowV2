# SDK Installation

## Package Installation

Install both the SDK and shared utilities:

```bash
npm install @streamflow/sdk @streamflow/shared
```

Or with yarn:

```bash
yarn add @streamflow/sdk @streamflow/shared
```

Or with pnpm:

```bash
pnpm add @streamflow/sdk @streamflow/shared
```

---

## Environment Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | ES modules support |
| TypeScript | 5.0+ | Optional but recommended |
| Browser | Modern | ES2020+ support |

---

## TypeScript Configuration

The SDK is written in TypeScript and includes type definitions. No additional `@types` packages are needed.

For best results, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

---

## Network Configuration

The SDK works with Movement blockchain networks:

### Testnet (Default)

```typescript
const client = new StreamFlowClient({
  apiBaseUrl: 'https://your-streamflow-api.com',
  creatorAddress: '0x...',
  ratePerSecond: 0.001,
  network: 'movement-testnet', // Default
});
```

### Network Details

| Network | RPC URL | Chain ID |
|---------|---------|----------|
| Movement Testnet (Bardock) | `https://testnet.movementnetwork.xyz/v1` | 250 |

---

## Getting Testnet Tokens

For development, obtain testnet MOVE from the faucet:

1. Visit [https://faucet.testnet.movementnetwork.xyz/](https://faucet.testnet.movementnetwork.xyz/)
2. Enter your wallet address
3. Request tokens

---

## Wallet Requirements

StreamFlow does not bundle wallet libraries. You'll need a wallet solution compatible with Movement/Aptos:

### Web Applications

```bash
# Install Aptos Wallet Adapter for React
npm install @aptos-labs/wallet-adapter-react @aptos-labs/ts-sdk
```

Supported wallets:
- Petra
- Nightly
- Pontem
- Rise
- Other AIP-62 compatible wallets

### Backend/Node.js

```bash
# For server-side signing (custodial)
npm install @aptos-labs/ts-sdk
```

---

## Peer Dependencies

The SDK has minimal dependencies:

| Package | Purpose |
|---------|---------|
| `@streamflow/shared` | Types and utilities |

No other peer dependencies are required.
