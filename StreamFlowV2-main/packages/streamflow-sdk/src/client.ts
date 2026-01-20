/**
 * StreamFlow SDK Client
 * 
 * Framework-agnostic client for StreamFlow pay-per-second payments.
 * Handles session lifecycle, cost tracking, and x402 settlement.
 */

import type {
  StreamFlowConfig,
  Session,
  SessionCost,
  StartSessionResult,
  StopSessionResult,
  SettleSessionResult,
  PrepareTransactionResult,
  PaymentRequirements,
} from "../../streamflow-shared/src/types";
import { calculateCost } from "../../streamflow-shared/src/pricing";
import { is402Response } from "../../streamflow-shared/src/x402";

export interface TransportAdapter {
  fetch(url: string, options?: RequestInit): Promise<Response>;
}

export interface WalletAdapter {
  getAddress(): Promise<string>;
  signAndSubmitTransaction(transaction: unknown): Promise<{ hash: string }>;
}

export interface CostUpdateCallback {
  (cost: SessionCost): void;
}

export interface StreamFlowClientOptions extends StreamFlowConfig {
  transport?: TransportAdapter;
  wallet?: WalletAdapter;
}

export class StreamFlowClient {
  private config: StreamFlowConfig;
  private transport: TransportAdapter;
  private wallet?: WalletAdapter;
  
  private currentSession: Session | null = null;
  private costUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private costUpdateCallbacks: CostUpdateCallback[] = [];

  constructor(options: StreamFlowClientOptions) {
    this.config = {
      apiBaseUrl: options.apiBaseUrl,
      creatorAddress: options.creatorAddress,
      ratePerSecond: options.ratePerSecond,
      network: options.network || "movement-testnet",
      asset: options.asset || "MOVE",
    };
    
    this.transport = options.transport || {
      fetch: (url, opts) => fetch(url, opts),
    };
    
    this.wallet = options.wallet;
  }

  get session(): Session | null {
    return this.currentSession;
  }

  get isActive(): boolean {
    return this.currentSession?.status === "active";
  }

  async startSession(params: { viewerAddress: string }): Promise<StartSessionResult> {
    const response = await this.transport.fetch(
      `${this.config.apiBaseUrl}/v1/sessions/start`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewerAddress: params.viewerAddress,
          creatorAddress: this.config.creatorAddress,
          ratePerSecond: this.config.ratePerSecond,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Failed to start session" }));
      throw new Error(error.message || "Failed to start session");
    }

    const result = await response.json() as StartSessionResult & { session: Session };
    this.currentSession = result.session;

    this.startCostTracking();

    return {
      sessionId: result.sessionId,
      message: result.message,
    };
  }

  async stopSession(): Promise<StopSessionResult> {
    if (!this.currentSession) {
      throw new Error("No active session to stop");
    }

    this.stopCostTracking();

    const response = await this.transport.fetch(
      `${this.config.apiBaseUrl}/v1/sessions/${this.currentSession.sessionId}/stop`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Failed to stop session" }));
      throw new Error(error.message || "Failed to stop session");
    }

    const result = await response.json() as StopSessionResult & { session: Session };
    this.currentSession = result.session;

    return {
      sessionId: result.sessionId,
      totalSeconds: result.totalSeconds,
      totalPaid: result.totalPaid,
      status: result.status,
    };
  }

  async settle(paymentHeader?: string): Promise<SettleSessionResult> {
    if (!this.currentSession) {
      throw new Error("No session to settle");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (paymentHeader) {
      headers["X-PAYMENT"] = paymentHeader;
    }

    const response = await this.transport.fetch(
      `${this.config.apiBaseUrl}/v1/sessions/${this.currentSession.sessionId}/settle`,
      {
        method: "POST",
        headers,
      }
    );

    if (is402Response(response.status)) {
      const requirements = await response.json() as PaymentRequirements;
      throw new PaymentRequiredError(requirements);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Failed to settle session" }));
      throw new Error(error.message || "Failed to settle session");
    }

    const result = await response.json() as SettleSessionResult;
    
    if (result.success && result.txHash) {
      this.currentSession = {
        ...this.currentSession,
        status: "settled",
        txHash: result.txHash,
      };
    }

    return result;
  }

  async prepareTransaction(): Promise<PrepareTransactionResult> {
    if (!this.currentSession) {
      throw new Error("No session to prepare transaction for");
    }

    const viewerAddress = this.wallet 
      ? await this.wallet.getAddress()
      : this.currentSession.viewerAddress;

    const response = await this.transport.fetch(
      `${this.config.apiBaseUrl}/v1/sessions/${this.currentSession.sessionId}/prepare-transaction`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderAddress: viewerAddress }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Failed to prepare transaction" }));
      throw new Error(error.message || "Failed to prepare transaction");
    }

    return await response.json() as PrepareTransactionResult;
  }

  async stopAndSettle(): Promise<SettleSessionResult> {
    await this.stopSession();
    
    try {
      return await this.settle();
    } catch (error) {
      if (error instanceof PaymentRequiredError) {
        throw error;
      }
      throw error;
    }
  }

  onCostUpdate(callback: CostUpdateCallback): () => void {
    this.costUpdateCallbacks.push(callback);
    
    return () => {
      const index = this.costUpdateCallbacks.indexOf(callback);
      if (index > -1) {
        this.costUpdateCallbacks.splice(index, 1);
      }
    };
  }

  getCurrentCost(): SessionCost | null {
    if (!this.currentSession) {
      return null;
    }

    if (this.currentSession.status !== "active") {
      return {
        seconds: this.currentSession.totalSeconds,
        cost: this.currentSession.totalPaid,
      };
    }

    return calculateCost(
      this.currentSession.startTime,
      Date.now(),
      this.currentSession.ratePerSecond
    );
  }

  private startCostTracking(): void {
    this.stopCostTracking();

    this.costUpdateInterval = setInterval(() => {
      const cost = this.getCurrentCost();
      if (cost) {
        this.costUpdateCallbacks.forEach(cb => cb(cost));
      }
    }, 1000);
  }

  private stopCostTracking(): void {
    if (this.costUpdateInterval) {
      clearInterval(this.costUpdateInterval);
      this.costUpdateInterval = null;
    }
  }

  destroy(): void {
    this.stopCostTracking();
    this.costUpdateCallbacks = [];
    this.currentSession = null;
  }
}

export class PaymentRequiredError extends Error {
  public readonly requirements: PaymentRequirements;

  constructor(requirements: PaymentRequirements) {
    super("Payment required (HTTP 402)");
    this.name = "PaymentRequiredError";
    this.requirements = requirements;
  }
}
