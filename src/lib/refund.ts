export function parseDealTypePercentage(dealType: string | null | undefined): number {
  const match = (dealType || "").match(/^(\d+)%\s*Refund$/i);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}

// Alias for consistent naming
export const parseDealType_percentage = parseDealTypePercentage;

export function calculateRefund(dealType: string, priceSale: number): number | null {
  const percentage = parseDealTypePercentage(dealType);
  if (percentage <= 0 || priceSale <= 0) return null;
  return Math.round((priceSale * percentage) / 100);
}

export function resolveRefundAmount(
  dealType: string,
  priceSale: number,
  fallback: number
): number {
  return calculateRefund(dealType, priceSale) ?? fallback;
}

// Backward-compatible alias for legacy imports
export const resolveCashbackAmount = resolveRefundAmount;