/**
 * StreamFlow Shared Types
 * 
 * Pure TypeScript types and interfaces for StreamFlow SDK.
 * No side effects, no dependencies on external libraries.
 */

export type SessionStatus = "active" | "stopped" | "settled";

export interface Session {
  sessionId: string;
  viewerAddress: string;
  creatorAddress: string;
  ratePerSecond: number;
  startTime: number;
  endTime: number | null;
  totalSeconds: number;
  totalPaid: number;
  status: SessionStatus;
  txHash: string | null;
}

export interface StartSessionParams {
  viewerAddress: string;
  creatorAddress: string;
  ratePerSecond: number;
}

export interface StartSessionResult {
  sessionId: string;
  message: string;
}

export interface StopSessionResult {
  sessionId: string;
  totalSeconds: number;
  totalPaid: number;
  status: SessionStatus;
}

export interface SettleSessionResult {
  success: boolean;
  txHash: string | null;
  settledAmount: number;
  sessionId: string;
  message: string;
}

export interface SessionCost {
  seconds: number;
  cost: number;
}

export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
}

export interface PrepareTransactionResult {
  unsignedTransactionBcsBase64: string;
  payTo: string;
  amount: string;
  sessionId: string;
  totalSeconds: number;
  totalAmount: number;
}

export interface X402WebhookEvent {
  eventType: "payment_confirmed" | "payment_failed" | "session_expired";
  sessionId: string;
  txHash?: string;
  amount?: number;
  timestamp: number;
}

export interface StreamFlowConfig {
  apiBaseUrl: string;
  creatorAddress: string;
  ratePerSecond: number;
  network?: string;
  asset?: string;
}
