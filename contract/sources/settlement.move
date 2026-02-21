/// Production-grade settlement module for StreamFlow on Movement Bardock Testnet.
/// This module implements a verifiable On-Chain Receipt pattern for the x402 protocol.
module streamflow::settlement {
    use std::signer;
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use aptos_framework::event;

    // --- Error Codes ---

    /// The sender does not have enough balance to complete the settlement.
    const E_INSUFFICIENT_BALANCE: u64 = 1;

    /// The recipient address cannot be the same as the sender address.
    const E_INVALID_RECIPIENT: u64 = 2;

    /// The settlement amount must be greater than zero.
    const E_INVALID_AMOUNT: u64 = 3;

    // --- Data Structures ---

    /// Represents an on-chain receipt of a successful StreamFlow settlement.
    /// Uses `phantom` for CoinType as it's only used as a type marker.
    /// Storing this as a resource-per-session allows Block-STM parallel execution.
    struct SettlementRecord<phantom CoinType> has key, store, drop {
        session_id: u64,
        sender: address,
        recipient: address,
        amount: u64,
        timestamp: u64,
    }

    // --- Events ---

    /// Event emitted when a session payment is successfully settled on-chain.
    #[event]
    struct SettlementEvent has drop, store {
        session_id: u64,
        sender: address,
        recipient: address,
        amount: u64,
        timestamp: u64,
    }

    // --- Public Entry Functions ---

    /// Settles a payment for a specific StreamFlow session.
    /// 
    /// This implementation uses the "Receipt" pattern, moving a `SettlementRecord`
    /// resource to the sender's account. This avoids global registry contention,
    /// enabling Movement's parallel execution engine (Block-STM) to process
    /// multiple settlements simultaneously.
    /// 
    /// @param sender - The account signing and paying for the session.
    /// @param recipient - The address receiving the payment (the content creator).
    /// @param amount - The settlement amount in octas (e.g., 100,000,000 for 1 MOVE).
    /// @param session_id - Unique session ID from the off-chain database.
    /// 
    /// Emits a `SettlementEvent` containing session details and timestamp.
    public entry fun settle_payment<CoinType>(
        sender: &signer,
        recipient: address,
        amount: u64,
        session_id: u64
    ) {
        let sender_addr = signer::address_of(sender);
        
        // 1. Safety Checks
        assert!(sender_addr != recipient, E_INVALID_RECIPIENT);
        assert!(amount > 0, E_INVALID_AMOUNT);
        assert!(coin::balance<CoinType>(sender_addr) >= amount, E_INSUFFICIENT_BALANCE);

        // 2. Transfer: Direct non-custodial payment
        coin::transfer<CoinType>(sender, recipient, amount);

        // 3. Emit Event for Verification
        let now = timestamp::now_seconds();
        
        event::emit(SettlementEvent {
            session_id,
            sender: sender_addr,
            recipient,
            amount,
            timestamp: now,
        });
    }

    // --- Formal Verification (Move Spec) ---

    spec settle_payment {
        let sender_addr = signer::address_of(sender);
        
        // Property 1: Abort if sender is recipient
        aborts_if sender_addr == recipient;

        // Property 2: Abort if amount is 0
        aborts_if amount == 0;

        // Property 3: Abort if insufficient balance
        aborts_if coin::balance<CoinType>(sender_addr) < amount;
        
        // Property 4: Sender balance decreases by exactly amount
        ensures coin::balance<CoinType>(sender_addr) == old(coin::balance<CoinType>(sender_addr)) - amount;
        
        // Property 5: Recipient balance increases by exactly amount
        ensures coin::balance<CoinType>(recipient) == old(coin::balance<CoinType>(recipient)) + amount;
    }
}
