/// Production-grade settlement module for StreamFlow on Movement Bardock Testnet.
//This module implements the on-chain part of the x402 payment protocol.
module streamflow::settlement {
    use std::signer;
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use aptos_framework::event;

    // --- Error Codes ---

    /// The sender does not have enough balance to complete the settlement.
    const EINSUFFICIENT_BALANCE: u64 = 1;

    // --- Events ---

    /// Event emitted when a session payment is successfully settled on-chain.
    /// This provides a verifiable audit trail for the off-chain PostgreSQL database.
    #[event]
    struct SettlementEvent has drop, store {
        /// The x402 session ID from the off-chain database.
        session_id: u64,
        /// The viewer's wallet address.
        sender: address,
        /// The creator's or platform's wallet address.
        recipient: address,
        /// The total amount settled in the units of <CoinType>.
        amount: u64,
        /// The blockchain timestamp of the settlement.
        timestamp: u64,
    }

    // --- Public Entry Functions ---

    /// Settles a payment for a specific StreamFlow session.
    /// 
    /// This function links a blockchain transaction to an off-chain session via `session_id`.
    /// It uses Move generics to support any Aptos-compatible coin (e.g., MOVE, USDC).
    /// 
    /// @param sender - The account signing and paying for the session.
    /// @param recipient - The address receiving the payment (the creator).
    /// @param amount - The settlement amount in octas (or equivalent smallest unit).
    /// @param session_id - The unique ID of the session being settled.
    public entry fun settle_payment<CoinType>(
        sender: &signer,
        recipient: address,
        amount: u64,
        session_id: u64
    ) {
        let sender_addr = signer::address_of(sender);
        
        // 1. Safety Check: Verify balance before transfer (optional as coin::transfer also checks)
        assert!(coin::balance<CoinType>(sender_addr) >= amount, EINSUFFICIENT_BALANCE);

        // 2. Settlement: Transfer funds directly from viewer to creator.
        // This ensures the platform remains non-custodial.
        coin::transfer<CoinType>(sender, recipient, amount);

        // 3. Event Emission: Broadcast the settlement for sub-second backend indexing.
        event::emit(SettlementEvent {
            session_id,
            sender: sender_addr,
            recipient,
            amount,
            timestamp: timestamp::now_seconds(),
        });
    }
}
