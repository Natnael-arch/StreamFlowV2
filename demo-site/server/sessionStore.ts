/**
 * Session Store for StreamFlow
 * 
 * PostgreSQL-backed storage for payment sessions using Drizzle ORM.
 */

import type { Session, SessionStatus } from "@shared/schema";
import { sessions } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

class SessionStore {
  constructor() {
    console.log("[SessionStore] Initialized PostgreSQL session storage");
  }

  /**
   * Creates a new session and stores it
   */
  async createSession(
    sessionId: string,
    viewerAddress: string,
    creatorAddress: string,
    ratePerSecond: number
  ): Promise<Session> {
    const startTime = Date.now();

    const [dbSession] = await db.insert(sessions).values({
      sessionId,
      viewerAddress,
      creatorAddress,
      ratePerSecond,
      startTime,
      status: "active",
    }).returning();

    console.log(`[SessionStore] Created session: ${sessionId}`);

    return this.mapDbToSession(dbSession);
  }

  /**
   * Retrieves a session by ID
   */
  async getSession(sessionId: string): Promise<Session | undefined> {
    const [dbSession] = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId));
    return dbSession ? this.mapDbToSession(dbSession) : undefined;
  }

  /**
   * Gets all sessions, optionally filtered by status or address
   */
  async getAllSessions(filters?: {
    viewerAddress?: string;
    creatorAddress?: string;
    status?: SessionStatus;
  }): Promise<Session[]> {
    let query = db.select().from(sessions);

    const conditions = [];
    if (filters?.viewerAddress) {
      conditions.push(eq(sessions.viewerAddress, filters.viewerAddress));
    }
    if (filters?.creatorAddress) {
      conditions.push(eq(sessions.creatorAddress, filters.creatorAddress));
    }
    if (filters?.status) {
      conditions.push(eq(sessions.status, filters.status));
    }

    const results = conditions.length > 0
      ? await db.select().from(sessions).where(and(...conditions)).orderBy(desc(sessions.startTime))
      : await db.select().from(sessions).orderBy(desc(sessions.startTime));

    return results.map(this.mapDbToSession);
  }

  /**
   * Gets all active sessions for a viewer
   */
  async getActiveSessionsForViewer(viewerAddress: string): Promise<Session[]> {
    return this.getAllSessions({ viewerAddress, status: "active" });
  }

  /**
   * Gets all sessions for a creator
   */
  async getSessionsForCreator(creatorAddress: string): Promise<Session[]> {
    return this.getAllSessions({ creatorAddress });
  }

  /**
   * Stops a session and calculates the final payment
   */
  async stopSession(sessionId: string): Promise<Session | null> {
    const session = await this.getSession(sessionId);

    if (!session) {
      console.log(`[SessionStore] Session not found: ${sessionId}`);
      return null;
    }

    if (session.status !== "active") {
      console.log(`[SessionStore] Session already stopped: ${sessionId}`);
      return session;
    }

    const endTime = Date.now();
    const totalSeconds = Math.floor((endTime - session.startTime) / 1000);
    const totalPaid = totalSeconds * session.ratePerSecond;

    const [updated] = await db.update(sessions)
      .set({
        endTime,
        totalSeconds,
        totalPaid,
        status: "stopped",
      })
      .where(eq(sessions.sessionId, sessionId))
      .returning();

    console.log(`[SessionStore] Stopped session: ${sessionId}`);
    console.log(`  - Duration: ${totalSeconds} seconds`);
    console.log(`  - Total Paid: ${totalPaid} MOVE`);

    return this.mapDbToSession(updated);
  }

  /**
   * Marks a session as settled with transaction hash
   */
  async settleSession(sessionId: string, txHash: string): Promise<Session | null> {
    const [updated] = await db.update(sessions)
      .set({
        status: "settled",
        txHash,
      })
      .where(eq(sessions.sessionId, sessionId))
      .returning();

    if (!updated) {
      console.log(`[SessionStore] Session not found for settlement: ${sessionId}`);
      return null;
    }

    console.log(`[SessionStore] Settled session: ${sessionId}`);
    console.log(`  - Transaction Hash: ${txHash}`);

    return this.mapDbToSession(updated);
  }

  /**
   * Calculates the current cost of an active session
   */
  async calculateCurrentCost(sessionId: string): Promise<{ seconds: number; cost: number } | null> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return null;
    }

    if (session.status !== "active") {
      return {
        seconds: session.totalSeconds,
        cost: session.totalPaid,
      };
    }

    const currentTime = Date.now();
    const seconds = Math.floor((currentTime - session.startTime) / 1000);
    const cost = seconds * session.ratePerSecond;

    return { seconds, cost };
  }

  /**
   * Gets session statistics
   */
  async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    totalRevenue: number;
  }> {
    const allSessions = await db.select().from(sessions);

    return {
      totalSessions: allSessions.length,
      activeSessions: allSessions.filter(s => s.status === "active").length,
      totalRevenue: allSessions.reduce((sum, s) => sum + (s.totalPaid || 0), 0),
    };
  }

  /**
   * Updates session from webhook events
   */
  async updateFromWebhook(
    sessionId: string,
    eventType: string,
    txHash?: string
  ): Promise<Session | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    if (eventType === "payment_confirmed" && txHash) {
      return this.settleSession(sessionId, txHash);
    }

    if (eventType === "payment_failed" || eventType === "session_expired") {
      const [updated] = await db.update(sessions)
        .set({ status: "stopped" })
        .where(eq(sessions.sessionId, sessionId))
        .returning();
      return updated ? this.mapDbToSession(updated) : null;
    }

    return session;
  }

  /**
   * Maps database row to Session interface
   */
  private mapDbToSession(dbSession: typeof sessions.$inferSelect): Session {
    return {
      id: dbSession.id,
      sessionId: dbSession.sessionId as string,
      viewerAddress: dbSession.viewerAddress,
      creatorAddress: dbSession.creatorAddress,
      ratePerSecond: dbSession.ratePerSecond,
      startTime: dbSession.startTime,
      endTime: dbSession.endTime,
      totalSeconds: dbSession.totalSeconds,
      totalPaid: dbSession.totalPaid,
      status: dbSession.status as SessionStatus,
      txHash: dbSession.txHash,
    };
  }
}

// Export singleton instance
export const sessionStore = new SessionStore();
