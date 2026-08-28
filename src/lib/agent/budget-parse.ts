/**
 * Deterministic INR budget extraction from buyer queries.
 * Used only when Gemini omits maxPricePaise. Generic amount patterns — not phrase-specific rules.
 */

function parseAmountInrToken(raw: string): number | null {
  const token = raw.replaceAll(",", "").trim().toLowerCase();
  const kMatch = token.match(/^(\d+(?:\.\d+)?)\s*k$/);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);
  const num = Number(token);
  if (Number.isFinite(num) && num > 0) return Math.round(num);
  return null;
}

const AMOUNT = String.raw`([\d,]+(?:\.\d+)?\s*k\b|[\d,]+)`;
const CURRENCY = String.raw`(?:₹|rs\.?\s*)?\s*`;

/** Extract a max budget in whole INR from natural language. */
export function parseBudgetInr(text: string): number | null {
  const normalized = text.trim();

  const thousandMatch = normalized.match(/\b(\d+(?:\.\d+)?)\s+thousand\b/i);
  if (thousandMatch) {
    return Math.round(Number(thousandMatch[1]) * 1000);
  }

  const capPatterns = [
    new RegExp(String.raw`\b(?:under|below|less than|within|upto|up to|max(?:imum)?|cap(?:ped)? at)\s+${CURRENCY}${AMOUNT}`, "i"),
    new RegExp(String.raw`\bbudget(?:\s+of)?\s+${CURRENCY}${AMOUNT}`, "i"),
  ];

  for (const pattern of capPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return parseAmountInrToken(match[1]!);
    }
  }

  const explicitInr = normalized.match(new RegExp(String.raw`(?:₹|rs\.?\s*)\s*${AMOUNT}`, "i"));
  if (explicitInr) {
    return parseAmountInrToken(explicitInr[1]!);
  }

  return null;
}