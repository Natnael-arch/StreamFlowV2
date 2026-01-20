# StreamFlow

## Overview

StreamFlow is a pay-per-second livestreaming payment platform built on the Movement blockchain. The application enables viewers to pay creators in real-time micropayments using the x402 protocol. Viewers connect their wallets via Aptos Wallet Adapter (supporting Petra, Nightly, and other Movement-compatible wallets) and pay a configurable rate per second while watching livestreams.

The core workflow:
1. Viewer starts watching → payment session opens
2. Real-time cost accumulates per second
3. Viewer stops watching → session settles with total payment calculated

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Build Tool**: Vite with custom development plugins for Replit
- **Design System**: Custom CSS variables for theming with light/dark mode support

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful JSON endpoints under `/api` prefix
- **Session Endpoints**:
  - `POST /api/session/start` - Opens payment session with viewer/creator addresses and rate
  - `POST /api/session/stop` - Closes session, calculates total time and payment
  - `GET /api/session/:id` - Retrieves session details
  - `GET /api/sessions` - Lists all sessions

### Data Storage
- **Session Storage**: In-memory Map for development (sessionStore.ts)
- **Database Schema**: Drizzle ORM configured for PostgreSQL (ready for production use)
- **Schema Location**: `shared/schema.ts` contains both database tables and TypeScript interfaces

### Payment Integration (x402 Protocol)
- **Location**: `server/x402.ts` and `client/src/hooks/use-x402.ts`
- **Protocol Flow**:
  1. Client calls `POST /api/session/:id/settle` without payment header
  2. Server returns HTTP 402 with `PaymentRequirements` JSON
  3. Client builds Aptos coin transfer transaction via `@aptos-labs/ts-sdk`
  4. Client signs with wallet and generates x402 payment header via `x402plus.aptosLikeSigner`
  5. Client retries with `X-PAYMENT` header
  6. Server verifies payment, submits transaction to Movement testnet, returns tx hash
- **Settle Endpoint**: `POST /api/session/:sessionId/settle`
- **Functions**:
  - `openX402Session()` - Creates payment channel between viewer and creator
  - `settleX402Session()` - Finalizes payment with calculated total
  - `createPaymentRequirements()` - Generates 402 response payload
  - `verifyPaymentHeader()` - Decodes x402 header, submits transaction to Movement RPC
  - `submitTransactionToMovement()` - Deserializes and submits signed transaction to chain
- **Frontend Hook**: `useX402()` - Handles 402 flow with proper Aptos transaction building

### Transaction Flow (Production Mode)
1. Client requests unsigned transaction from server via `POST /api/session/:id/prepare-transaction`
2. Server builds coin transfer transaction using Aptos SDK (avoids browser CORS issues)
3. Client deserializes and signs with wallet (returns AccountAuthenticator)
4. x402plus encodes signature + transaction bytes as base64 payment header
5. Client retries settle with `X-PAYMENT` header
6. Server decodes the header, deserializes transaction and authenticator
7. Server submits signed transaction to Movement testnet via Aptos SDK
8. Server waits for confirmation and returns on-chain transaction hash

### Environment Variables for x402
- `MOVEMENT_PAY_TO` - Wallet address to receive payments (production)
- `PLATFORM_PRIVATE_KEY` - Server signing key (production)
- `MOVEMENT_NETWORK` - Blockchain network (default: movement-testnet)
- `MOVEMENT_RPC_URL` - Movement testnet RPC endpoint
- `MOVEMENT_FACILITATOR_URL` - x402 facilitator URL (fallback)
- `X402_ACCEPT_DEMO_PAYMENTS=false` - Set to true for demo mode (no real transactions)
- `VITE_USE_MOCK_WALLET=false` - Set to true to skip wallet signing

### Project Structure
```
client/           # React frontend
  src/
    components/ui/  # shadcn/ui components
    pages/          # Route components
    hooks/          # Custom React hooks
    lib/            # Utilities and query client
server/           # Express backend
  index.ts        # Server entry point
  routes.ts       # API route handlers
  sessionStore.ts # PostgreSQL session storage
  x402.ts         # Payment protocol integration
  storage.ts      # User storage interface
  v1/             # Versioned Core API
    sessions.ts   # v1 session endpoints
shared/           # Shared TypeScript types
  schema.ts       # Database schema and API types
packages/         # Reusable SDK packages
  streamflow-shared/  # Pure utilities and types
    src/
      types.ts        # TypeScript interfaces
      pricing.ts      # Cost calculations
      session.ts      # Session lifecycle helpers
      x402.ts         # x402 protocol helpers
  streamflow-sdk/     # Client SDK
    src/
      client.ts       # StreamFlowClient class
  API.md             # Core API v1 documentation
  README.md          # SDK documentation
```

### Core API v1
Versioned API routes for platform integration at `/v1/sessions/*`:
- `POST /v1/sessions/start` - Start payment session
- `GET /v1/sessions/:id` - Get session details
- `POST /v1/sessions/:id/stop` - Stop session
- `POST /v1/sessions/:id/prepare-transaction` - Prepare payment transaction
- `POST /v1/sessions/:id/settle` - Settle with x402 protocol
- `GET /v1/sessions` - List sessions with filtering

See `packages/API.md` for full documentation.

### Documentation
Production-grade SDK and API documentation located in `docs/`:
- `docs/README.md` - Main entry point and overview
- `docs/concepts.md` - Sessions, pricing, settlement concepts
- `docs/architecture.md` - Component separation, SDK design
- `docs/installation.md` - Package installation and setup
- `docs/usage.md` - Step-by-step integration guide
- `docs/api-reference.md` - Complete HTTP API reference
- `docs/payment-flow.md` - x402 protocol flow details
- `docs/modes.md` - Demo vs production mode configuration
- `docs/security.md` - Trust model and security considerations
- `docs/use-cases.md` - Integration examples and use cases
- `docs/faq.md` - Common questions and troubleshooting

### Build Configuration
- **Development**: `tsx` for running TypeScript directly
- **Production Build**: esbuild for server, Vite for client
- **Output**: Server bundles to `dist/index.cjs`, client to `dist/public`

## External Dependencies

### Blockchain & Payments
- **x402 Protocol**: Movement blockchain micropayment protocol (placeholder integration)
- **Reference**: github.com/Rahat-ch/movement-x402

### Wallet Integration
- **Aptos Wallet Adapter**: @aptos-labs/wallet-adapter-react for connecting browser extension wallets
- **Supported Wallets**: Petra, Nightly, and other AIP-62 compatible wallets
- **Network Configuration**: Users must configure their wallet to connect to Movement testnet
- **Movement RPC**: https://testnet.movementnetwork.xyz/v1 (Bardock testnet)
- **Movement Faucet**: https://faucet.testnet.movementnetwork.xyz/
- **Chain ID**: 250
- **Wallet Addresses**: Backend is wallet-agnostic, expects addresses from frontend

### Database
- **PostgreSQL**: Production database via Drizzle ORM
- **Drizzle Kit**: Database migrations and schema push
- **Connection**: Requires `DATABASE_URL` environment variable

### UI Components
- **Radix UI**: Headless component primitives (dialogs, dropdowns, tooltips, etc.)
- **shadcn/ui**: Pre-styled component library built on Radix
- **Lucide**: Icon library

### Fonts
- **Inter**: Primary UI font
- **JetBrains Mono / Fira Code / Geist Mono**: Monospace fonts for payment amounts and code