export function parseDealTypePercentage(dealType: string | null | undefined): number {
  const match = (dealType || "").match(/^(\d+)%\s*Cashback$/i);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}

export function calculateCashback(dealType: string, priceSale: number): number | null {
  const percentage = parseDealTypePercentage(dealType);
  if (percentage <= 0 || priceSale <= 0) return null;
  return Math.round((priceSale * percentage) / 100);
}

export function resolveCashbackAmount(
  dealType: string,
  priceSale: number,
  fallback: number
): number {
  return calculateCashback(dealType, priceSale) ?? fallback;
}
