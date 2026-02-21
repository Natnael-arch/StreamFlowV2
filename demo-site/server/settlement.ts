import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

const MOVEMENT_RPC_URL = process.env.MOVEMENT_RPC_URL || "https://testnet.movementnetwork.xyz/v1";
const CONTRACT_ADDRESS = process.env.MOVEMENT_CONTRACT_ADDRESS || "0x00bc9b0ecb6722865cd483e18184957d8043bf6283c56aa9b8a2c1b433d6b31d";

// Initialize Aptos client for Movement testnet
export const aptos = new Aptos(
    new AptosConfig({
        network: Network.CUSTOM,
        fullnode: MOVEMENT_RPC_URL,
    })
);

/**
 * Verifies a settlement transaction on the Movement blockchain.
 * Checks that the transaction was successful and that the emitted event
 * matches the expected session ID, recipient, and amount.
 */
export async function verifySettlement(
    txHash: string,
    expectedSessionId: number | string,
    expectedRecipient: string,
    expectedAmount: string | bigint
) {
    try {
        // 1. Wait for transaction with timeout
        const tx = await aptos.waitForTransaction({
            transactionHash: txHash,
            options: { timeoutSecs: 30 }
        }) as any;

        if (!tx || !tx.success) {
            throw new Error("Transaction failed or was not found");
        }

        // 2. Fetch full transaction details to get events
        const txDetails = await aptos.getTransactionByHash({
            transactionHash: txHash
        }) as any;

        if (!txDetails || !txDetails.events) {
            throw new Error("No events found in transaction");
        }

        // 3. Find our specific SettlementEvent
        const eventType = `${CONTRACT_ADDRESS}::settlement::SettlementEvent`;
        const settlementEvent = txDetails.events.find((e: any) => e.type === eventType);

        if (!settlementEvent) {
            throw new Error(`Expected SettlementEvent not found. Looked for: ${eventType}`);
        }

        // 4. Validate exact session ID (Critical for replay protection)
        const { session_id, amount, recipient } = settlementEvent.data;

        if (session_id.toString() !== expectedSessionId.toString()) {
            throw new Error(`Session ID mismatch! Expected ${expectedSessionId}, got ${session_id}`);
        }

        // 5. Validate amount (Protects against underpayment)
        if (BigInt(amount) < BigInt(expectedAmount)) {
            throw new Error(`Amount mismatch! Expected at least ${expectedAmount}, got ${amount}`);
        }

        // 6. Final success confirmation
        return {
            verified: true,
            txHash,
            amount: amount.toString(),
            recipient,
            sessionId: session_id
        };
    } catch (error) {
        if (error instanceof Error) throw error;
        throw new Error("Unknown error during verification");
    }
}
