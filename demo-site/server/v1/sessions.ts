/**
 * StreamFlow Core API v1 - Sessions
 * 
 * Versioned API routes for StreamFlow platform integration.
 * Reuses internal functions from the demo backend.
 */

import { Router, Request, Response } from "express";
import { sessionStore } from "../sessionStore";
import {
  createPaymentRequirements,
  verifyPaymentHeader
} from "../x402";
import { MovementClient } from "streamflow-sdk";

const movementClient = new MovementClient();
import { startSessionSchema, stopSessionSchema } from "@shared/schema";
import { ZodError } from "zod";

const router = Router();

/**
 * POST /v1/sessions/start
 * 
 * Starts a new payment session for pay-per-second streaming.
 * 
 * Request Body:
 * - viewerAddress: string - Wallet address of the viewer
 * - creatorAddress: string - Wallet address of the content creator
 * - ratePerSecond: number - Cost per second in MOVE
 * 
 * Response:
 * - sessionId: string - Unique session identifier
 * - session: Session - Full session object
 * - message: string - Status message
 */
router.post("/start", async (req: Request, res: Response) => {
  try {
    const validated = startSessionSchema.parse(req.body);
    const { viewerAddress, creatorAddress, ratePerSecond } = validated;

    const sessionId = `sf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session = await sessionStore.createSession(
      sessionId,
      viewerAddress,
      creatorAddress,
      ratePerSecond
    );

    console.log(`[API v1] Session started: ${sessionId}`);

    return res.status(201).json({
      sessionId,
      session,
      message: "Session started successfully",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors,
      });
    }
    console.error("[API v1] Error starting session:", error);
    return res.status(500).json({ error: "Failed to start session" });
  }
});

/**
 * GET /v1/sessions/:sessionId
 * 
 * Retrieves session details by ID.
 * 
 * Response:
 * - session: Session | null - Session object if found
 * - currentCost: { seconds, cost } | null - Current cost if session is active
 */
router.get("/:sessionId", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = await sessionStore.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: "Session not found",
        session: null,
      });
    }

    const currentCost = await sessionStore.calculateCurrentCost(sessionId);

    return res.status(200).json({
      session,
      currentCost,
    });
  } catch (error) {
    console.error("[API v1] Error getting session:", error);
    return res.status(500).json({ error: "Failed to get session" });
  }
});

/**
 * POST /v1/sessions/:sessionId/stop
 * 
 * Stops an active session and calculates final payment.
 * 
 * Response:
 * - session: Session - Updated session with final cost
 * - totalSeconds: number - Total streaming duration
 * - totalPaid: number - Total amount to pay in MOVE
 */
router.post("/:sessionId/stop", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = await sessionStore.stopSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    console.log(`[API v1] Session stopped: ${sessionId}`);

    return res.status(200).json({
      sessionId,
      session,
      totalSeconds: session.totalSeconds,
      totalPaid: session.totalPaid,
      message: "Session stopped successfully",
    });
  } catch (error) {
    console.error("[API v1] Error stopping session:", error);
    return res.status(500).json({ error: "Failed to stop session" });
  }
});

/**
 * POST /v1/sessions/:sessionId/prepare-transaction
 * 
 * Prepares an unsigned transaction for the client to sign.
 * Used in the x402 payment flow.
 * 
 * Request Body:
 * - senderAddress: string - Wallet address of the payer (viewer)
 * 
 * Response:
 * - unsignedTransactionBcsBase64: string - Base64 encoded transaction
 * - payTo: string - Recipient address (creator)
 * - amount: string - Amount in octas
 * - sessionId: string
 * - totalSeconds: number
 * - totalAmount: number
 */
router.post("/:sessionId/prepare-transaction", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { senderAddress } = req.body;

    if (!senderAddress) {
      return res.status(400).json({ error: "senderAddress is required" });
    }

    const session = await sessionStore.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    let totalAmount = session.totalPaid;
    if (session.status === "active") {
      const currentCost = await sessionStore.calculateCurrentCost(sessionId);
      if (currentCost) {
        totalAmount = currentCost.cost;
      }
    }

    const amountInOctas = BigInt(Math.floor(totalAmount * 1e8));
    const result = await movementClient.buildUnsignedTransaction(
      senderAddress,
      session.creatorAddress,
      amountInOctas,
      sessionId
    );

    console.log(`[API v1] Prepared transaction for session: ${sessionId}`);

    return res.status(200).json({
      ...result,
      sessionId,
      totalSeconds: session.totalSeconds,
      totalAmount,
    });
  } catch (error) {
    console.error("[API v1] Error preparing transaction:", error);
    return res.status(500).json({ error: "Failed to prepare transaction" });
  }
});

/**
 * POST /v1/sessions/:sessionId/settle
 * 
 * Settles a session payment using x402 protocol.
 * 
 * Headers:
 * - X-PAYMENT: Base64 encoded signed transaction (required for settlement)
 * 
 * Response (without X-PAYMENT header - HTTP 402):
 * - PaymentRequirements object with payment details
 * 
 * Response (with valid X-PAYMENT header):
 * - success: boolean
 * - txHash: string - On-chain transaction hash
 * - settledAmount: number
 * - sessionId: string
 */
router.post("/:sessionId/settle", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const paymentHeader = req.headers["x-payment"] as string | undefined;

    const session = await sessionStore.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (!paymentHeader) {
      // Ensure session is stopped before settling
      if (session.status === "active") {
        return res.status(400).json({
          error: "Session must be stopped before settling. Call POST /v1/sessions/:id/stop first."
        });
      }

      // Calculate the actual payable amount
      const currentCost = await sessionStore.calculateCurrentCost(sessionId);
      const payableAmount = currentCost?.cost || session.totalPaid;
      const payableSeconds = currentCost?.seconds || session.totalSeconds;

      const requirements = createPaymentRequirements(
        sessionId,
        payableAmount,
        payableSeconds,
        `/v1/sessions/${sessionId}/settle`,
        session.creatorAddress
      );
      console.log(`[API v1] Returning 402 Payment Required for session: ${sessionId}`);
      console.log(`  - Amount: ${payableAmount} MOVE for ${payableSeconds} seconds`);
      return res.status(402).json(requirements);
    }

    try {
      // Verify payment using the creator's address as the expected recipient
      const txResult = await verifyPaymentHeader(
        paymentHeader,
        sessionId,
        session.id,
        session.totalPaid,
        session.creatorAddress
      );
      if (!txResult.success) {
        throw new Error("Payment verification failed");
      }
      await sessionStore.settleSession(sessionId, txResult.txHash);

      console.log(`[API v1] Session settled: ${sessionId}, txHash: ${txResult.txHash}`);

      return res.status(200).json({
        success: true,
        txHash: txResult.txHash,
        settledAmount: session.totalPaid,
        sessionId,
        message: "Payment settled successfully",
      });
    } catch (error) {
      console.error("[API v1] Payment verification failed:", error);
      return res.status(400).json({
        error: "Payment verification failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  } catch (error) {
    console.error("[API v1] Error settling session:", error);
    return res.status(500).json({ error: "Failed to settle session" });
  }
});

/**
 * GET /v1/sessions
 * 
 * Lists all sessions with optional filtering.
 * 
 * Query Parameters:
 * - viewerAddress: string - Filter by viewer
 * - creatorAddress: string - Filter by creator
 * - status: "active" | "stopped" | "settled" - Filter by status
 * 
 * Response:
 * - sessions: Session[] - Array of matching sessions
 * - count: number - Total count
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { viewerAddress, creatorAddress, status } = req.query;

    const filters: {
      viewerAddress?: string;
      creatorAddress?: string;
      status?: "active" | "stopped" | "settled";
    } = {};

    if (typeof viewerAddress === "string") filters.viewerAddress = viewerAddress;
    if (typeof creatorAddress === "string") filters.creatorAddress = creatorAddress;
    if (status === "active" || status === "stopped" || status === "settled") {
      filters.status = status;
    }

    const sessions = await sessionStore.getAllSessions(filters);

    return res.status(200).json({
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error("[API v1] Error listing sessions:", error);
    return res.status(500).json({ error: "Failed to list sessions" });
  }
});

export default router;
