/**
 * StreamFlow Pricing Utilities
 * 
 * Pure functions for cost calculations and currency conversions.
 * No side effects, no external dependencies.
 */

export const OCTAS_PER_MOVE = 1e8;

export function moveToOctas(move: number): bigint {
  return BigInt(Math.floor(move * OCTAS_PER_MOVE));
}

export function octasToMove(octas: bigint | number): number {
  const octasNum = typeof octas === "bigint" ? Number(octas) : octas;
  return octasNum / OCTAS_PER_MOVE;
}

export function calculateCost(
  startTime: number,
  currentTime: number,
  ratePerSecond: number
): { seconds: number; cost: number } {
  const seconds = Math.max(0, Math.floor((currentTime - startTime) / 1000));
  const cost = seconds * ratePerSecond;
  return { seconds, cost };
}

export function calculateFinalCost(
  startTime: number,
  endTime: number,
  ratePerSecond: number
): { totalSeconds: number; totalPaid: number } {
  const totalSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const totalPaid = totalSeconds * ratePerSecond;
  return { totalSeconds, totalPaid };
}

export function formatCost(cost: number, decimals: number = 6): string {
  return cost.toFixed(decimals);
}

export function formatCostWithSymbol(cost: number, symbol: string = "MOVE"): string {
  return `${formatCost(cost)} ${symbol}`;
}
