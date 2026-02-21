import type { Express } from "express";
import { createServer, type Server } from "http";
import { sessionStore } from "./sessionStore";
import { openX402Session, settleX402Session, isValidWalletAddress, getX402Config, createPaymentRequirements, verifyPaymentHeader, toOctas } from "./x402";
import { MovementClient } from "streamflow-sdk";

const movementClient = new MovementClient();
import { startSessionSchema, stopSessionSchema, webhookSchema } from "@shared/schema";
import v1SessionsRouter from "./v1/sessions";
import type {
  StartSessionRequest,
  StartSessionResponse,
  StopSessionRequest,
  StopSessionResponse,
  GetSessionResponse,
  GetAllSessionsResponse,
  WebhookResponse,
  SettleSessionResponse,
} from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  /**
   * POST /api/session/start
   * Opens a new streaming payment session.
   */
  app.post("/api/session/start", async (req, res) => {
    // Start session request received

    try {
      const parseResult = startSessionSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request body",
          details: parseResult.error.errors,
        });
      }

      const { viewerAddress, creatorAddress, ratePerSecond }: StartSessionRequest = parseResult.data;

      if (!isValidWalletAddress(viewerAddress)) {
        return res.status(400).json({ error: "Invalid viewer wallet address" });
      }

      if (!isValidWalletAddress(creatorAddress)) {
        return res.status(400).json({ error: "Invalid creator wallet address" });
      }

      const existingSessions = await sessionStore.getActiveSessionsForViewer(viewerAddress);
      const duplicateSession = existingSessions.find(s => s.creatorAddress === creatorAddress);

      if (duplicateSession) {
        return res.status(409).json({
          error: "Active session already exists with this creator",
          sessionId: duplicateSession.sessionId,
        });
      }

      const x402Result = await openX402Session(viewerAddress, creatorAddress, ratePerSecond);

      if (!x402Result.success) {
        return res.status(500).json({ error: "Failed to open payment session" });
      }

      const session = await sessionStore.createSession(
        x402Result.sessionId,
        viewerAddress,
        creatorAddress,
        ratePerSecond
      );

      const response: StartSessionResponse = {
        sessionId: session.sessionId,
        message: "Payment session started successfully",
      };

      return res.status(201).json(response);
    } catch (error) {
      console.error("[API] Error starting session:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /api/session/stop
   * Stops an active streaming payment session and settles the payment.
   */
  app.post("/api/session/stop", async (req, res) => {
    try {
      const parseResult = stopSessionSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request body",
          details: parseResult.error.errors,
        });
      }

      const { sessionId }: StopSessionRequest = parseResult.data;
      const existingSession = await sessionStore.getSession(sessionId);

      if (!existingSession) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (existingSession.status !== "active") {
        return res.status(400).json({
          error: "Session is not active",
          status: existingSession.status,
        });
      }

      const stoppedSession = await sessionStore.stopSession(sessionId);

      if (!stoppedSession) {
        return res.status(500).json({ error: "Failed to stop session" });
      }

      const settlementResult = await settleX402Session(sessionId, stoppedSession.totalPaid);

      if (settlementResult.success) {
        await sessionStore.settleSession(sessionId, settlementResult.txHash);
      }

      // Session stopped

      const response: StopSessionResponse = {
        sessionId: stoppedSession.sessionId,
        totalSeconds: stoppedSession.totalSeconds,
        totalPaid: stoppedSession.totalPaid,
        txHash: settlementResult.success ? settlementResult.txHash : null,
        message: settlementResult.success
          ? "Session stopped and payment settled successfully"
          : "Session stopped but payment settlement pending",
      };

      return res.status(200).json(response);
    } catch (error) {
      console.error("[API] Error stopping session:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /api/session/:sessionId/prepare-transaction
   * Builds an unsigned transaction for the client to sign.
   * This avoids CORS issues with Movement RPC by building on the server.
   */
  app.post("/api/session/:sessionId/prepare-transaction", async (req, res) => {
    const { sessionId } = req.params;
    const { senderAddress } = req.body;

    // Prepare transaction

    try {
      if (!senderAddress || typeof senderAddress !== 'string') {
        return res.status(400).json({ error: "senderAddress is required" });
      }

      const session = await sessionStore.getSession(sessionId);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status === "settled") {
        return res.status(400).json({ error: "Session already settled" });
      }

      let totalAmount = session.totalPaid;

      if (session.status === "active") {
        const currentCost = await sessionStore.calculateCurrentCost(sessionId);
        if (currentCost) {
          totalAmount = currentCost.cost;
        }
      }

      const amountInOctas = BigInt(Math.floor(totalAmount * 1e8));

      // Build settlement transaction via SDK
      const result = await movementClient.buildUnsignedTransaction(
        senderAddress,
        session.creatorAddress,
        amountInOctas,
        session.id // Use numeric ID for on-chain transaction
      );

      // Transaction prepared

      return res.status(200).json({
        ...result,
        sessionId,
        totalAmount,
      });
    } catch (error) {
      console.error("[API] Error preparing transaction:", error);
      return res.status(500).json({ error: "Failed to build transaction" });
    }
  });


  /**
   * POST /api/session/:sessionId/settle
   * x402 payment settlement endpoint.
   * 
   * Flow:
   * 1. If no X-PAYMENT header -> return HTTP 402 with PaymentRequirements
   * 2. If X-PAYMENT header present -> verify payment, settle session, return tx hash
   * 
   * This enables withX402Fetch on the client to automatically handle payment.
   */
  app.post("/api/session/:sessionId/settle", async (req, res) => {
    const { sessionId } = req.params;
    const paymentHeader = req.get("X-PAYMENT");

    // Settle session

    try {
      const session = await sessionStore.getSession(sessionId);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status === "settled") {
        return res.status(400).json({
          error: "Session already settled",
          txHash: session.txHash,
        });
      }

      let totalSeconds = session.totalSeconds;
      let totalAmount = session.totalPaid;

      if (session.status === "active") {
        const currentCost = await sessionStore.calculateCurrentCost(sessionId);
        if (currentCost) {
          totalSeconds = currentCost.seconds;
          totalAmount = currentCost.cost;
        }
      }

      if (!paymentHeader) {
        // Payment requirements needed

        const resourceUrl = `${req.protocol}://${req.get('host')}/api/session/${sessionId}/settle`;
        const paymentRequirements = createPaymentRequirements(
          sessionId,
          totalAmount,
          totalSeconds,
          resourceUrl,
          session.creatorAddress // Send payment directly to creator
        );

        res.setHeader("Content-Type", "application/json");
        return res.status(402).json(paymentRequirements);
      }

      console.log("[API] X-PAYMENT header found, verifying payment");

      const stoppedSession = session.status === "active"
        ? await sessionStore.stopSession(sessionId)
        : session;

      if (!stoppedSession) {
        return res.status(500).json({ error: "Failed to stop session" });
      }

      const verification = await verifyPaymentHeader(paymentHeader, sessionId, stoppedSession.id, stoppedSession.totalPaid);

      if (!verification.success) {
        // Fallback or secondary check using MovementClient if needed, 
        // but verifyPaymentHeader already does on-chain check.
        // For this task, we explicitly use MovementClient.verifyPayment for validation.
        const isValid = await movementClient.verifyPayment(paymentHeader, stoppedSession.id, toOctas(stoppedSession.totalPaid));

        if (!isValid) {
          return res.status(402).json({
            error: "Payment verification failed",
            message: "Payment header invalid or insufficient",
          });
        }

        // If MovementClient verified it, we can proceed
        verification.success = true;
        verification.txHash = paymentHeader;
      }

      await sessionStore.settleSession(sessionId, verification.txHash);

      console.info(`[API] Session settled: ${sessionId} (tx: ${verification.txHash})`);

      const response: SettleSessionResponse = {
        success: true,
        txHash: verification.txHash,
        settledAmount: stoppedSession.totalPaid,
        sessionId: sessionId,
        message: "Payment verified and session settled successfully",
      };

      return res.status(200).json(response);
    } catch (error) {
      console.error("[API] Error settling session:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /api/session/:sessionId
   * Retrieves details of a specific session.
   */
  app.get("/api/session/:sessionId", async (req, res) => {
    const { sessionId } = req.params;

    try {
      const session = await sessionStore.getSession(sessionId);

      if (!session) {
        return res.status(404).json({
          session: null,
          message: "Session not found",
        } as GetSessionResponse);
      }

      if (session.status === "active") {
        const currentCost = await sessionStore.calculateCurrentCost(sessionId);
        if (currentCost) {
          session.totalSeconds = currentCost.seconds;
          session.totalPaid = currentCost.cost;
        }
      }

      return res.status(200).json({
        session,
        message: "Session retrieved successfully",
      } as GetSessionResponse);
    } catch (error) {
      console.error("[API] Error getting session:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /api/sessions
   * Retrieves all sessions, optionally filtered.
   */
  app.get("/api/sessions", async (req, res) => {
    try {
      const { viewerAddress, creatorAddress, status } = req.query;

      const sessions = await sessionStore.getAllSessions({
        viewerAddress: viewerAddress as string | undefined,
        creatorAddress: creatorAddress as string | undefined,
        status: status as "active" | "stopped" | "settled" | undefined,
      });

      const enrichedSessions = await Promise.all(sessions.map(async session => {
        if (session.status === "active") {
          const currentCost = await sessionStore.calculateCurrentCost(session.sessionId);
          if (currentCost) {
            return {
              ...session,
              totalSeconds: currentCost.seconds,
              totalPaid: currentCost.cost,
            };
          }
        }
        return session;
      }));

      return res.status(200).json({
        sessions: enrichedSessions,
        message: `Retrieved ${enrichedSessions.length} session(s)`,
      } as GetAllSessionsResponse);
    } catch (error) {
      console.error("[API] Error getting sessions:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /api/session/:sessionId/cost
   * Gets the current running cost of an active session.
   */
  app.get("/api/session/:sessionId/cost", async (req, res) => {
    const { sessionId } = req.params;

    try {
      const cost = await sessionStore.calculateCurrentCost(sessionId);

      if (!cost) {
        return res.status(404).json({ error: "Session not found" });
      }

      return res.status(200).json({
        sessionId,
        seconds: cost.seconds,
        cost: cost.cost,
      });
    } catch (error) {
      console.error("[API] Error getting cost:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /api/stats
   * Gets overall session statistics.
   */
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await sessionStore.getStats();
      return res.status(200).json(stats);
    } catch (error) {
      console.error("[API] Error getting stats:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /api/webhook/x402
   * 
   * Webhook endpoint for receiving x402 payment status updates.
   * This endpoint will be called by the x402 protocol when payment events occur.
   * 
   * Event Types:
   * - payment_confirmed: Payment was successfully confirmed on-chain
   * - payment_failed: Payment failed to process
   * - session_expired: Session timed out without settlement
   */
  app.post("/api/webhook/x402", async (req, res) => {
    try {
      const parseResult = webhookSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          received: false,
          message: "Invalid webhook payload",
        } as WebhookResponse);
      }

      const { eventType, sessionId, txHash, amount, timestamp } = parseResult.data;

      // Processing webhook

      const updatedSession = await sessionStore.updateFromWebhook(sessionId, eventType, txHash);

      if (!updatedSession) {
        return res.status(404).json({
          received: true,
          message: "Session not found",
        } as WebhookResponse);
      }

      // Webhook processed

      return res.status(200).json({
        received: true,
        message: `Event ${eventType} processed for session ${sessionId}`,
      } as WebhookResponse);
    } catch (error) {
      console.error("[API] Webhook processing error:", error);
      return res.status(500).json({
        received: false,
        message: "Internal server error",
      } as WebhookResponse);
    }
  });

  /**
   * GET /api/x402/config
   * Returns x402 configuration info for the frontend
   */
  app.get("/api/x402/config", async (req, res) => {
    const config = getX402Config();
    return res.status(200).json({
      network: config.network,
      asset: config.asset,
      isProductionMode: config.isProductionMode,
      facilitatorUrl: config.facilitatorUrl,
    });
  });

  /**
   * StreamFlow Core API v1
   * Versioned API routes for platform integration
   */
  app.use("/v1/sessions", v1SessionsRouter);

  return httpServer;
}
