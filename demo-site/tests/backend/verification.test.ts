import { jest } from '@jest/globals';
import { verifySettlement, aptos } from '../../server/settlement';

// Mock the Aptos client from @aptos-labs/ts-sdk
jest.mock('@aptos-labs/ts-sdk', () => {
    const actual = jest.requireActual('@aptos-labs/ts-sdk') as any;
    return {
        ...actual,
        Aptos: jest.fn().mockImplementation(() => ({
            waitForTransaction: jest.fn(),
            getTransactionByHash: jest.fn(),
        })),
    };
});

describe('Settlement Verification Security - Replay Attack Protection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('Should throw Session ID mismatch error when detecting a Recycled Receipt (Replay Attack)', async () => {
        // 1. Setup the Scenario
        const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        const oldSessionId = 1024;
        const currentSessionId = 2000;
        const expectedPayTo = '0x00bc9b0ecb6722865cd483e18184957d8043bf6283c56aa9b8a2c1b433d6b31d';
        const expectedAmountOctas = '500000000';

        // 2. Mock Movement/Aptos Network Responses
        // Simulate successful transaction commitment
        (aptos.waitForTransaction as jest.Mock<any>).mockResolvedValue({
            success: true,
            hash: txHash,
        });

        // Simulate "Old" Data: return a transaction where the event data contains an old session_id
        (aptos.getTransactionByHash as jest.Mock<any>).mockResolvedValue({
            hash: txHash,
            success: true,
            events: [
                {
                    // Match the real Movement/Aptos event structure
                    type: '0x00bc9b0ecb6722865cd483e18184957d8043bf6283c56aa9b8a2c1b433d6b31d::settlement::SettlementEvent',
                    data: {
                        session_id: oldSessionId.toString(), // "1024" (The Replayed Receipt)
                        amount: expectedAmountOctas,
                        recipient: expectedPayTo,
                    },
                },
            ],
        });

        // 3. Execution & Assertion
        // Attempt to verify the old receipt against the current session ID (2000)
        // The function must throw an error because the on-chain session ID (1024) does not match.
        await expect(
            verifySettlement(
                txHash,
                currentSessionId,
                expectedPayTo,
                expectedAmountOctas
            )
        ).rejects.toThrow(`Session ID mismatch! Expected ${currentSessionId}, got ${oldSessionId}`);

        // Verify mocks were called correctly
        expect(aptos.waitForTransaction).toHaveBeenCalledWith(expect.objectContaining({
            transactionHash: txHash
        }));
        expect(aptos.getTransactionByHash).toHaveBeenCalledWith({
            transactionHash: txHash
        });
    });

    test('Should throw Amount mismatch error when detecting an Underpaid Transaction (Amount Spoofing)', async () => {
        // 1. Setup the Scenario
        const txHash = '0xabcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234';
        const sessionId = 2000;
        const lowAmountOctas = '100'; // "Dust" payment
        const expectedAmountOctas = '500000000'; // 5 MOVE
        const expectedPayTo = '0x00bc9b0ecb6722865cd483e18184957d8043bf6283c56aa9b8a2c1b433d6b31d';

        // 2. Mock Movement/Aptos Network Responses
        (aptos.waitForTransaction as jest.Mock<any>).mockResolvedValue({
            success: true,
            hash: txHash,
        });

        (aptos.getTransactionByHash as jest.Mock<any>).mockResolvedValue({
            hash: txHash,
            success: true,
            events: [
                {
                    type: '0x00bc9b0ecb6722865cd483e18184957d8043bf6283c56aa9b8a2c1b433d6b31d::settlement::SettlementEvent',
                    data: {
                        session_id: sessionId.toString(),
                        amount: lowAmountOctas,
                        recipient: expectedPayTo,
                    },
                },
            ],
        });

        // 3. Execution & Assertion
        // The function must throw an error because 100 < 500,000,000
        await expect(
            verifySettlement(
                txHash,
                sessionId,
                expectedPayTo,
                expectedAmountOctas
            )
        ).rejects.toThrow(`Amount mismatch! Expected at least ${expectedAmountOctas}, got ${lowAmountOctas}`);
    });

    test('Should correctly handle large BigInt amounts (u64 edge case)', async () => {
        // 1. Setup the Scenario
        const txHash = '0xffff1111ffff1111ffff1111ffff1111ffff1111ffff1111ffff1111ffff1111';
        const sessionId = 3000;
        // Large amount: 10^18 Octas (Exceeds Number.MAX_SAFE_INTEGER 2^53 - 1 ≈ 9e15)
        const largeAmountStr = '1000000000000000000';
        const expectedPayTo = '0x00bc9b0ecb6722865cd483e18184957d8043bf6283c56aa9b8a2c1b433d6b31d';

        // 2. Mock Movement/Aptos Network Responses
        (aptos.waitForTransaction as jest.Mock<any>).mockResolvedValue({ success: true, hash: txHash });

        (aptos.getTransactionByHash as jest.Mock<any>).mockResolvedValue({
            hash: txHash,
            success: true,
            events: [
                {
                    type: '0x00bc9b0ecb6722865cd483e18184957d8043bf6283c56aa9b8a2c1b433d6b31d::settlement::SettlementEvent',
                    data: {
                        session_id: sessionId.toString(),
                        amount: largeAmountStr, // String from RPC
                        recipient: expectedPayTo,
                    },
                },
            ],
        });

        // 3. Execution & Assertion
        // Should pass if BigInt conversion is correct
        const result = await verifySettlement(
            txHash,
            sessionId,
            expectedPayTo,
            largeAmountStr
        );

        expect(result.verified).toBe(true);
    });
});
