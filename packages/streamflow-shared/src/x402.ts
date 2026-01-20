/**
 * StreamFlow x402 Protocol Utilities
 * 
 * Pure functions for x402 payment protocol operations.
 * No side effects, no external dependencies on Aptos SDK or network.
 */

import type { PaymentRequirements, Session } from "./types";
import { moveToOctas, formatCost } from "./pricing";

export const X402_SCHEME = "exact";
export const X402_ASSET = "MOVE";
export const X402_MIME_TYPE = "application/json";
export const X402_DEFAULT_TIMEOUT = 60;

export interface CreatePaymentRequirementsParams {
  session: Session;
  network: string;
  payTo: string;
  resource?: string;
  maxTimeoutSeconds?: number;
}

export function createPaymentRequirements(
  params: CreatePaymentRequirementsParams
): PaymentRequirements {
  const {
    session,
    network,
    payTo,
    resource = `/api/session/${session.sessionId}/settle`,
    maxTimeoutSeconds = X402_DEFAULT_TIMEOUT,
  } = params;

  const amountInOctas = moveToOctas(session.totalPaid);

  return {
    scheme: X402_SCHEME,
    network,
    maxAmountRequired: amountInOctas.toString(),
    resource,
    description: `Payment for ${session.totalSeconds} seconds of streaming at ${formatCost(session.ratePerSecond)} MOVE/sec`,
    mimeType: X402_MIME_TYPE,
    payTo,
    maxTimeoutSeconds,
    asset: X402_ASSET,
  };
}

export function parsePaymentHeader(header: string): {
  signedTransactionBase64: string;
} | null {
  try {
    const decoded = JSON.parse(atob(header));
    if (decoded.signedTransactionBase64) {
      return { signedTransactionBase64: decoded.signedTransactionBase64 };
    }
    return null;
  } catch {
    return null;
  }
}

export function encodePaymentHeader(signedTransactionBase64: string): string {
  return btoa(JSON.stringify({ signedTransactionBase64 }));
}

export function is402Response(status: number): boolean {
  return status === 402;
}

export function extractPaymentRequirements(
  response: Response | { status: number; json: () => Promise<unknown> }
): Promise<PaymentRequirements | null> {
  if (!is402Response(response.status)) {
    return Promise.resolve(null);
  }
  return response.json() as Promise<PaymentRequirements>;
}
