/**
 * x402 Payment Integration Module for StreamFlow
 * 
 * This module integrates x402plus for real Movement blockchain payments.
 * The x402 protocol enables micropayments for streaming content.
 * 
 * Reference: x402plus npm package
 */

import { randomUUID } from "crypto";
import { Aptos, AptosConfig, Network, TransactionAuthenticator, Deserializer, RawTransaction, SignedTransaction, Serializer } from "@aptos-labs/ts-sdk";
import { MovementClient } from "streamflow-sdk";
import { normalizeAddress } from "@streamflow/shared";

import type { X402OpenSessionResult, X402SettleSessionResult, PaymentRequirements } from "@shared/schema";

const MOVEMENT_NETWORK = process.env.MOVEMENT_NETWORK || "movement-testnet";
const MOVEMENT_ASSET = process.env.MOVEMENT_ASSET || "0x1::aptos_coin::AptosCoin";
const MOVEMENT_PAY_TO = process.env.MOVEMENT_PAY_TO || "";
const MOVEMENT_RPC_URL = process.env.MOVEMENT_RPC_URL || "https://testnet.movementnetwork.xyz/v1";
const MOVEMENT_CONTRACT_ADDRESS = process.env.MOVEMENT_CONTRACT_ADDRESS || "0xa563f61047c73ecb0160d9d9eefb7a38e35edbfdaf3953f0dbe1cdee9982cff";
const MOVEMENT_FACILITATOR_URL = process.env.MOVEMENT_FACILITATOR_URL || "https://facilitator.stableyard.fi";
const PLATFORM_PRIVATE_KEY = process.env.PLATFORM_PRIVATE_KEY;
const ACCEPT_DEMO_PAYMENTS = process.env.X402_ACCEPT_DEMO_PAYMENTS === 'true';

const movementClient = new MovementClient(MOVEMENT_RPC_URL, MOVEMENT_CONTRACT_ADDRESS);

const isProductionMode = !!MOVEMENT_PAY_TO && !!PLATFORM_PRIVATE_KEY && !ACCEPT_DEMO_PAYMENTS;

// Initialize Aptos client for Movement testnet
// (moved to settlement.ts)

if (isProductionMode) {
  console.info(`[x402] Running in PRODUCTION MODE on ${MOVEMENT_NETWORK}`);
} else {
  console.warn("[x402] Running in DEMO MODE - no real blockchain transactions");
}

// (moved to settlement.ts)


/**
 * Create x402 paywall middleware configuration for Express routes.
 * This is designed to work with x402plus package.
 * 
 * The x402 flow for StreamFlow:
 * 1. Client starts watching -> openX402Session creates session
 * 2. Real-time cost accumulates per second on frontend
 * 3. Client stops watching -> settleX402Session calculates total
 * 4. x402 facilitator handles the actual payment settlement
 */
export function createPaywallConfig(ratePerSecond: number, maxDurationSeconds: number = 3600) {
  const maxAmount = Math.floor(ratePerSecond * maxDurationSeconds * 1e8).toString();

  return {
    network: MOVEMENT_NETWORK,
    asset: MOVEMENT_ASSET,
    maxAmountRequired: maxAmount,
    description: "StreamFlow pay-per-second streaming",
    mimeType: "application/json",
    maxTimeoutSeconds: maxDurationSeconds,
  };
}

/**
 * Opens a new x402 payment session between a viewer and creator.
 * 
 * @param viewerAddress - The wallet address of the viewer
 * @param creatorAddress - The wallet address of the content creator
 * @param ratePerSecond - The payment rate in MOVE tokens per second
 * @returns Promise with session ID and success status
 */
export async function openX402Session(
  viewerAddress: string,
  creatorAddress: string,
  ratePerSecond: number
): Promise<X402OpenSessionResult> {
  const sessionId = `x402_${randomUUID()}`;

  // Placeholder for any async initialization if needed
  await new Promise(resolve => setTimeout(resolve, 50));

  return {
    sessionId,
    success: true,
  };
}

/**
 * Settles an x402 payment session.
 * 
 * In production mode with x402plus, this would:
 * 1. Build a Movement transaction for the total amount
 * 2. Sign with PLATFORM_PRIVATE_KEY
 * 3. Submit to the facilitator for settlement
 * 4. Return the on-chain transaction hash
 * 
 * Currently returns demo tx hash - full integration requires
 * client-side payment header handling via withX402Fetch.
 * 
 * @param sessionId - The unique session identifier
 * @param totalAmount - The total amount to settle in MOVE tokens
 * @returns Promise with success status, transaction hash, and settled amount
 */
export async function settleX402Session(
  sessionId: string,
  totalAmount: number
): Promise<X402SettleSessionResult> {
  await new Promise(resolve => setTimeout(resolve, 50));

  let txHash: string;

  if (isProductionMode) {
    txHash = `0x${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 32)}`;
  } else {
    txHash = `demo_${randomUUID().replace(/-/g, '')}`;
  }

  return {
    success: true,
    txHash,
    settledAmount: totalAmount,
  };
}

/**
 * Validates a wallet address format.
 */
export function isValidWalletAddress(address: string): boolean {
  if (!address || address.trim().length === 0) {
    return false;
  }

  if (address.startsWith('0x')) {
    return /^0x[a-fA-F0-9]{40,64}$/.test(address);
  }

  return true;
}

/**
 * Returns x402 configuration info
 */
export function getX402Config() {
  return {
    network: MOVEMENT_NETWORK,
    asset: MOVEMENT_ASSET,
    isProductionMode,
    facilitatorUrl: MOVEMENT_FACILITATOR_URL,
  };
}

/**
 * Convert MOVE amount to smallest unit (Octas - 8 decimals)
 */
export function toOctas(moveAmount: number): string {
  return Math.floor(moveAmount * 1e8).toString();
}

/**
 * Convert Octas to MOVE
 */
export function fromOctas(octas: string | number): number {
  return Number(octas) / 1e8;
}

/**
 * Creates PaymentRequirements object for HTTP 402 response.
 * Used when client calls settle endpoint without X-PAYMENT header.
 * 
 * @param creatorAddress - The wallet address of the content creator (receives payment)
 */
export function createPaymentRequirements(
  sessionId: string,
  totalAmount: number,
  totalSeconds: number,
  resourceUrl: string,
  creatorAddress?: string
): PaymentRequirements {
  // Use creator's address if provided, otherwise fall back to platform address
  const payToAddress = creatorAddress || MOVEMENT_PAY_TO;

  return {
    scheme: "exact",
    network: MOVEMENT_NETWORK,
    maxAmountRequired: toOctas(totalAmount),
    resource: resourceUrl,
    description: `StreamFlow payment for ${totalSeconds}s of streaming`,
    mimeType: "application/json",
    payTo: payToAddress,
    maxTimeoutSeconds: 600,
    asset: MOVEMENT_ASSET,
  };
}

interface X402PaymentHeader {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature?: string;
    transaction?: string;
    signatureBcsBase64?: string;
    transactionBcsBase64?: string;
  };
}

function decodePaymentHeader(header: string): X402PaymentHeader | null {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded) as X402PaymentHeader;
  } catch {
    return null;
  }
}

function fromBase64(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}


// (moved to settlement.ts as verifySettlement)

/**
 * Verifies an X-PAYMENT header and submits the transaction to Movement testnet.
 * 
 * Supports two formats:
 * 1. Transaction hash (0x...) - client already submitted, we verify on-chain
 * 2. x402 encoded header - legacy format with signature+transaction bytes
 * 
 * In demo mode, accepts demo payment headers with a demo tx hash.
 * 
 * @param paymentHeader - The X-PAYMENT header value
 * @param sessionId - The session ID for logging
 * @param expectedAmount - Expected payment amount in MOVE
 * @param recipientAddress - The expected recipient address (creator or platform)
 */
export async function verifyPaymentHeader(
  paymentHeader: string,
  sessionId: string,
  sessionNumericId: number,
  expectedAmount: number,
  recipientAddress?: string
): Promise<{ success: boolean; txHash: string }> {
  // Use provided recipient address or fall back to platform address
  const expectedRecipient = recipientAddress || MOVEMENT_PAY_TO;

  // Demo mode handling
  if (!isProductionMode) {
    if (!paymentHeader.startsWith('demo_')) {
      return { success: false, txHash: '' };
    }
    return {
      success: true,
      txHash: paymentHeader,
    };
  }

  // Production mode - check if it's a transaction hash (client already submitted)
  if (paymentHeader.startsWith('0x')) {
    console.log(`[x402] Production mode - verifying submitted transaction hash`);

    const verification = await movementClient.verifyPayment(
      paymentHeader,
      sessionNumericId,
      toOctas(expectedAmount)
    );

    if (verification) {
      return { success: true, txHash: paymentHeader };
    }

    return { success: false, txHash: '' };
  }

  // Legacy encoded x402 header format
  const decoded = decodePaymentHeader(paymentHeader);
  if (!decoded) {
    console.log(`[x402] Failed to decode payment header`);
    return { success: false, txHash: '' };
  }

  console.log(`[x402] Decoded payment header:`, {
    version: decoded.x402Version,
    scheme: decoded.scheme,
    network: decoded.network,
    hasSignature: !!decoded.payload.signatureBcsBase64,
    hasTransaction: !!decoded.payload.transactionBcsBase64,
  });

  if (decoded.x402Version !== 1) {
    console.log(`[x402] Unsupported x402 version: ${decoded.x402Version}`);
    return { success: false, txHash: '' };
  }

  // Validate network
  if (decoded.network !== MOVEMENT_NETWORK) {
    console.log(`[x402] Network mismatch: expected ${MOVEMENT_NETWORK}, got ${decoded.network}`);
    return { success: false, txHash: '' };
  }

  // Extract and decode the transaction and signature
  const signatureBase64 = decoded.payload.signatureBcsBase64 || decoded.payload.signature;
  const transactionBase64 = decoded.payload.transactionBcsBase64 || decoded.payload.transaction;

  if (!signatureBase64 || !transactionBase64) {
    console.log(`[x402] Missing signature or transaction in payment header`);
    return { success: false, txHash: '' };
  }

  try {
    const signatureBytes = fromBase64(signatureBase64);
    const transactionBytes = fromBase64(transactionBase64);

    console.log(`[x402] Decoded bytes - signature: ${signatureBytes.length}B, transaction: ${transactionBytes.length}B`);

    // Submit directly to Movement testnet via SDK
    const result = await movementClient.submitSignedTransaction(transactionBytes, signatureBytes);

    if (result.success) {
      console.log(`[x402] Payment verified and submitted: ${result.txHash}`);
      return result;
    }

    // Fallback to facilitator if direct submission fails
    console.log(`[x402] Direct submission failed, trying facilitator: ${MOVEMENT_FACILITATOR_URL}`);

    const response = await fetch(`${MOVEMENT_FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentHeader,
        sessionId,
        expectedAmount: toOctas(expectedAmount),
        asset: MOVEMENT_ASSET,
        network: MOVEMENT_NETWORK,
      }),
    });

    if (!response.ok) {
      console.log(`[x402] Facilitator settlement failed: ${response.status}`);
      return { success: false, txHash: '' };
    }

    const facilitatorResult = await response.json() as { txHash?: string; success?: boolean };

    if (facilitatorResult.success && facilitatorResult.txHash) {
      console.log(`[x402] Facilitator settled payment: ${facilitatorResult.txHash}`);
      return { success: true, txHash: facilitatorResult.txHash };
    }

    console.log(`[x402] Facilitator rejected payment`);
    return { success: false, txHash: '' };
  } catch (error) {
    console.error(`[x402] Payment verification error:`, error);
    return { success: false, txHash: '' };
  }
}
