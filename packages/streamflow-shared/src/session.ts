/**
 * StreamFlow Session Utilities
 * 
 * Pure functions for session lifecycle operations.
 * No side effects, no external dependencies.
 */

import type { Session, SessionStatus, SessionCost } from "./types";
import { calculateCost, calculateFinalCost } from "./pricing";

export function generateSessionId(): string {
  return `sf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createSession(
  sessionId: string,
  viewerAddress: string,
  creatorAddress: string,
  ratePerSecond: number,
  startTime: number = Date.now()
): Session {
  return {
    sessionId,
    viewerAddress,
    creatorAddress,
    ratePerSecond,
    startTime,
    endTime: null,
    totalSeconds: 0,
    totalPaid: 0,
    status: "active",
    txHash: null,
  };
}

export function stopSession(session: Session, endTime: number = Date.now()): Session {
  if (session.status !== "active") {
    return session;
  }

  const { totalSeconds, totalPaid } = calculateFinalCost(
    session.startTime,
    endTime,
    session.ratePerSecond
  );

  return {
    ...session,
    endTime,
    totalSeconds,
    totalPaid,
    status: "stopped",
  };
}

export function settleSession(session: Session, txHash: string): Session {
  return {
    ...session,
    status: "settled",
    txHash,
  };
}

export function getSessionCost(session: Session, currentTime: number = Date.now()): SessionCost {
  if (session.status !== "active") {
    return {
      seconds: session.totalSeconds,
      cost: session.totalPaid,
    };
  }

  return calculateCost(session.startTime, currentTime, session.ratePerSecond);
}

export function isSessionActive(session: Session): boolean {
  return session.status === "active";
}

export function isSessionSettled(session: Session): boolean {
  return session.status === "settled";
}

export function canSettle(session: Session): boolean {
  return session.status === "stopped" && !session.txHash;
}

/**
 * Normalize an address to 64 hex characters (Aptos/Movement format)
 */
export function normalizeAddress(addr: string): string {
  if (!addr) return addr;
  const clean = addr.startsWith('0x') ? addr.slice(2) : addr;
  const padded = clean.padStart(64, '0');
  return `0x${padded}`;
}
