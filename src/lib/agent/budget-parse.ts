/**
 * Deterministic INR budget extraction from buyer queries.
 * Budget cues are hard constraints — only explicit phrasing is accepted.
 */

function parseAmountInrToken(raw: string): number | null {
  const token = raw.replaceAll(",", "").trim().toLowerCase();
  const kMatch = token.match(/^(\d+(?:\.\d+)?)\s*k$/);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);
  const num = Number(token);
  if (Number.isFinite(num) && num > 0) return Math.round(num);
  return null;
}

/** Extract a max budget in whole INR from natural language. */
export function parseBudgetInr(text: string): number | null {
  const normalized = text.trim();

  const underMatch = normalized.match(
    /\b(?:under|below|within|upto|up to)\s+(?:₹|rs\.?\s*)?\s*([\d,]+(?:\.\d+)?\s*k\b|[\d,]+)/i,
  );
  if (underMatch) {
    return parseAmountInrToken(underMatch[1]!);
  }

  const budgetMatch = normalized.match(
    /\bbudget\s+(?:₹|rs\.?\s*)?\s*([\d,]+(?:\.\d+)?\s*k\b|[\d,]+)/i,
  );
  if (budgetMatch) {
    return parseAmountInrToken(budgetMatch[1]!);
  }

  const explicitInr = normalized.match(/(?:₹|rs\.?\s*)\s*([\d,]+(?:\.\d+)?\s*k\b|[\d,]+)/i);
  if (explicitInr) {
    return parseAmountInrToken(explicitInr[1]!);
  }

  return null;
}
