/**
 * StreamFlow SDK
 * 
 * Client SDK for StreamFlow pay-per-second streaming payments.
 */

export { StreamFlowClient, PaymentRequiredError } from "./client";
export type {
  StreamFlowClientOptions,
  TransportAdapter,
  WalletAdapter,
  CostUpdateCallback,
} from "./client";

export * from "../../streamflow-shared/src/types";
export * from "../../streamflow-shared/src/pricing";
export * from "../../streamflow-shared/src/session";
export * from "../../streamflow-shared/src/x402";
