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
import { normalizeAddress } from "../../streamflow-shared/src/session";
import {
  Aptos,
  AptosConfig,
  Network,
  Deserializer,
  RawTransaction,
  TransactionAuthenticator,
  SignedTransaction,
  Serializer
} from "@aptos-labs/ts-sdk";

// Default constants for Movement Bardock Testnet
const DEFAULT_BARDOCK_CONTRACT_ADDRESS = "0x00bc9b0ecb6722865cd483e18184957d8043bf6283c56aa9b8a2c1b433d6b31d";
const DEFAULT_MOVEMENT_RPC_URL = "https://testnet.movementnetwork.xyz/v1";

/**
 * Custom Error Classes for StreamFlow SDK
 */
export class StreamFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamFlowError";
  }
}

export class InvalidSessionError extends StreamFlowError {
  constructor(message: string = "No active session found") {
    super(message);
    this.name = "InvalidSessionError";
  }
}

export class ValidationError extends StreamFlowError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class PaymentRequiredError extends StreamFlowError {
  public readonly requirements: PaymentRequirements;

  constructor(requirements: PaymentRequirements) {
    super("Payment required (HTTP 402)");
    this.name = "PaymentRequiredError";
    this.requirements = requirements;
  }
}

export class BlockchainError extends StreamFlowError {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = "BlockchainError";
  }
}

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
    if (!options.apiBaseUrl) throw new ValidationError("apiBaseUrl is required");
    if (!options.creatorAddress) throw new ValidationError("creatorAddress is required");
    if (options.ratePerSecond <= 0) throw new ValidationError("ratePerSecond must be greater than 0");

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
    if (!params.viewerAddress) {
      throw new ValidationError("viewerAddress is required to start a session");
    }

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
      throw new StreamFlowError(error.message || "Failed to start session");
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
      throw new InvalidSessionError("No active session to stop");
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
      throw new StreamFlowError(error.message || "Failed to stop session");
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
      throw new InvalidSessionError("No session to settle");
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
      throw new StreamFlowError(error.message || "Failed to settle session");
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
      throw new InvalidSessionError("No session to prepare transaction for");
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
      throw new StreamFlowError(error.message || "Failed to prepare transaction");
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

/**
 * MovementClient
 * 
 * Specialized client for Movement Bardock Testnet interaction.
 */
export class MovementClient {
  private aptos: Aptos;
  private contractAddress: string;

  constructor(rpcUrl: string = DEFAULT_MOVEMENT_RPC_URL, contractAddress: string = DEFAULT_BARDOCK_CONTRACT_ADDRESS) {
    const config = new AptosConfig({
      network: Network.CUSTOM,
      fullnode: rpcUrl,
    });
    this.aptos = new Aptos(config);
    this.contractAddress = normalizeAddress(contractAddress);
  }

  /**
   * Generates the payload for a settle_payment transaction.
   */
  getSettlementPayload(recipient: string, amount: bigint | string, sessionId: string | number): { data: { function: string; typeArguments: string[]; functionArguments: string[] } } {
    if (!recipient) throw new ValidationError("recipient address is required");
    if (BigInt(amount) <= 0n) throw new ValidationError("settlement amount must be greater than 0");

    return {
      data: {
        function: `${this.contractAddress}::settlement::settle_payment`,
        typeArguments: ["0x1::aptos_coin::AptosCoin"],
        functionArguments: [normalizeAddress(recipient), amount.toString(), sessionId.toString()],
      },
    };
  }

  /**
   * Builds an unsigned settlement transaction for a viewer to sign.
   */
  async buildUnsignedTransaction(
    sender: string,
    recipient: string,
    amount: bigint | string,
    sessionId: string | number
  ): Promise<{ unsignedTransactionBcsBase64: string; payTo: string; amount: string }> {
    if (!sender) throw new ValidationError("sender address is required");
    if (!recipient) throw new ValidationError("recipient address is required");
    if (BigInt(amount) <= 0n) throw new ValidationError("settlement amount must be greater than 0");

    const transaction = await this.aptos.transaction.build.simple({
      sender: normalizeAddress(sender),
      data: {
        function: `${this.contractAddress}::settlement::settle_payment`,
        typeArguments: ["0x1::aptos_coin::AptosCoin"],
        functionArguments: [normalizeAddress(recipient), amount.toString(), sessionId.toString()],
      },
    });

    const rawTxBytes = transaction.rawTransaction.bcsToBytes();
    const base64 = Buffer.from(rawTxBytes).toString('base64');

    return {
      unsignedTransactionBcsBase64: base64,
      payTo: normalizeAddress(recipient),
      amount: amount.toString(),
    };
  }

  /**
   * Submits a signed transaction to Movement testnet.
   */
  async submitSignedTransaction(
    rawTxBytes: Uint8Array,
    signatureBytes: Uint8Array
  ): Promise<{ success: boolean; txHash: string }> {
    try {
      // Deserialize segments
      const rawTxDeserializer = new Deserializer(rawTxBytes);
      const rawTransaction = (RawTransaction as any).deserialize(rawTxDeserializer);

      const sigDeserializer = new Deserializer(signatureBytes);
      const txAuthenticator = (TransactionAuthenticator as any).deserialize(sigDeserializer);

      // Submit
      const pendingTx = await (this.aptos.transaction.submit as any).simple({
        signature: txAuthenticator,
        transaction: rawTransaction,
      });

      // Wait for confirmation
      const confirmedTx = await this.aptos.waitForTransaction({
        transactionHash: pendingTx.hash,
        options: { timeoutSecs: 30 }
      });

      return {
        success: true,
        txHash: confirmedTx.hash,
      };
    } catch (error) {
      throw new BlockchainError("Transaction submission failed", error);
    }
  }

  /**
   * Verifies a settlement payment on-chain.
   */
  async verifyPayment(
    txHash: string,
    expectedSessionId: string | number,
    expectedAmount: bigint | string
  ): Promise<boolean> {
    try {
      const tx = await this.aptos.getTransactionByHash({ transactionHash: txHash }) as any;

      if (!tx || !tx.success || !tx.events) {
        return false;
      }

      const eventType = `${this.contractAddress}::settlement::SettlementEvent`;
      const settlementEvent = tx.events.find((e: any) => e.type === eventType);

      if (!settlementEvent) {
        return false;
      }

      const { session_id, amount } = settlementEvent.data;

      const sessionIdMatch = session_id.toString() === expectedSessionId.toString();
      const amountMatch = BigInt(amount) >= BigInt(expectedAmount);

      return sessionIdMatch && amountMatch;
    } catch (error) {
      throw new BlockchainError("Payment verification failed", error);
    }
  }
}
