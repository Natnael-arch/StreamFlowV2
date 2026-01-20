import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, bigint, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Sessions table for PostgreSQL persistence
export const sessions = pgTable("sessions", {
  sessionId: varchar("session_id").primaryKey(),
  viewerAddress: text("viewer_address").notNull(),
  creatorAddress: text("creator_address").notNull(),
  ratePerSecond: real("rate_per_second").notNull(),
  startTime: bigint("start_time", { mode: "number" }).notNull(),
  endTime: bigint("end_time", { mode: "number" }),
  totalSeconds: bigint("total_seconds", { mode: "number" }).notNull().default(0),
  totalPaid: real("total_paid").notNull().default(0),
  status: text("status").notNull().default("active"),
  txHash: text("tx_hash"),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  totalSeconds: true,
  totalPaid: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type DbSession = typeof sessions.$inferSelect;

// Session status enum
export type SessionStatus = "active" | "stopped" | "settled";

// Session interface for StreamFlow pay-per-second streaming
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

// API Request/Response types
export interface StartSessionRequest {
  viewerAddress: string;
  creatorAddress: string;
  ratePerSecond: number;
}

export interface StartSessionResponse {
  sessionId: string;
  message: string;
}

export interface StopSessionRequest {
  sessionId: string;
}

export interface StopSessionResponse {
  sessionId: string;
  totalSeconds: number;
  totalPaid: number;
  txHash: string | null;
  message: string;
}

export interface GetSessionResponse {
  session: Session | null;
  message: string;
}

export interface GetAllSessionsResponse {
  sessions: Session[];
  message: string;
}

// x402 Integration types
export interface X402OpenSessionResult {
  sessionId: string;
  success: boolean;
}

export interface X402SettleSessionResult {
  success: boolean;
  txHash: string;
  settledAmount: number;
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

export interface SettleSessionResponse {
  success: boolean;
  txHash: string | null;
  settledAmount: number;
  sessionId: string;
  message: string;
}

// Webhook types for x402 payment status updates
export interface X402WebhookPayload {
  eventType: "payment_confirmed" | "payment_failed" | "session_expired";
  sessionId: string;
  txHash?: string;
  amount?: number;
  timestamp: number;
}

export interface WebhookResponse {
  received: boolean;
  message: string;
}

// Zod schemas for request validation
export const startSessionSchema = z.object({
  viewerAddress: z.string().min(1, "Viewer address is required"),
  creatorAddress: z.string().min(1, "Creator address is required"),
  ratePerSecond: z.number().positive("Rate per second must be positive"),
});

export const stopSessionSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
});

export const webhookSchema = z.object({
  eventType: z.enum(["payment_confirmed", "payment_failed", "session_expired"]),
  sessionId: z.string().min(1),
  txHash: z.string().optional(),
  amount: z.number().optional(),
  timestamp: z.number(),
});
