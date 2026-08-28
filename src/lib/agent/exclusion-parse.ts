/**
 * Deterministic extraction of product exclusion references from buyer queries.
 * Used by the Phase 3A fallback parser and to reconcile query text with Gemini intent.
 */

const EXCLUSION_CUE =
  /\b(?:except|exclude|without|but\s+not|anything\s+but|other\s+than|don'?t\s+(?:show|include)|i\s+don'?t\s+want)\s+/i;

const EXCLUSION_CLAUSE_PATTERNS: RegExp[] = [
  /\bexcept\s+(.+?)(?=\s*,\s*(?:under|below|cheapest|sorted|show|give)|$)/gi,
  /\bexclude\s+(.+?)(?=\s*,\s*(?:under|below|cheapest|sorted|show|give)|$)/gi,
  /\bwithout\s+(.+?)(?=\s*,\s*(?:under|below|cheapest|sorted|show|give)|$)/gi,
  /\bbut\s+not\s+(.+?)(?=\s*,\s*(?:under|below|cheapest|sorted|show|give)|$)/gi,
  /\banything\s+but\s+(.+?)(?=\s*,\s*(?:under|below|cheapest|sorted|show|give)|$)/gi,
  /\bother\s+than\s+(.+?)(?=\s*,\s*(?:under|below|cheapest|sorted|show|give)|$)/gi,
  /\bdon'?t\s+(?:show|include)\s+(.+?)(?=\s*,\s*(?:under|below|cheapest|sorted|show|give)|$)/gi,
  /\bi\s+don'?t\s+want\s+(.+?)(?=\s*,\s*(?:under|below|cheapest|sorted|show|give)|$)/gi,
  /\bnot\s+(.+?)(?=\s*,\s*(?:under|below|cheapest|sorted|show|give)|$)/gi,
  /\bno\s+(.+?)(?=\s*,\s*(?:under|below|cheapest|sorted|show|give)|$)/gi,
];

const STRIP_CLAUSE_PATTERNS: RegExp[] = [
  /\s*,\s*except\s+.+$/i,
  /\s+except\s+.+$/i,
  /\s*,\s*exclude\s+.+$/i,
  /\s+exclude\s+.+$/i,
  /\s*,\s*without\s+.+$/i,
  /\s+without\s+.+$/i,
  /\s*,\s*but\s+not\s+.+$/i,
  /\s+but\s+not\s+.+$/i,
  /\s*,\s*anything\s+but\s+.+$/i,
  /\s+anything\s+but\s+.+$/i,
  /\s*,\s*other\s+than\s+.+$/i,
  /\s+other\s+than\s+.+$/i,
  /\s*,\s*don'?t\s+(?:show|include)\s+.+$/i,
  /\s+don'?t\s+(?:show|include)\s+.+$/i,
  /\s*,\s*i\s+don'?t\s+want\s+.+$/i,
  /\s+i\s+don'?t\s+want\s+.+$/i,
  /\s*,\s*not\s+.+$/i,
  /\s+not\s+.+$/i,
  /\s*,\s*no\s+.+$/i,
  /\s+no\s+.+$/i,
];

function normalizeReference(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanReferenceFragment(fragment: string): string {
  return normalizeReference(
    fragment
      .replace(/\s+under\s+(?:₹|rs\.?\s*)?[\d,k]+.*$/i, "")
      .replace(/\s+(?:under|below|within|upto|up to)\s+.+$/i, "")
      .replace(/[.,;]+$/g, "")
      .trim(),
  );
}

function splitReferenceList(fragment: string): string[] {
  return fragment
    .split(/\s+and\s+|\s*,\s*/i)
    .map(cleanReferenceFragment)
    .filter((reference) => reference.length >= 3);
}

/** Extract product exclusion references from natural language (deterministic fallback). */
export function parseExclusionReferences(text: string): string[] {
  const refs = new Set<string>();

  for (const pattern of EXCLUSION_CLAUSE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      for (const reference of splitReferenceList(match[1]!)) {
        refs.add(reference);
      }
    }
  }

  return [...refs];
}

/** Remove exclusion clauses so entity resolution does not treat excluded names as the target product. */
export function stripExclusionClauses(text: string): string {
  let result = text.trim();
  for (const pattern of STRIP_CLAUSE_PATTERNS) {
    result = result.replace(pattern, "").trim();
  }
  return normalizeReference(result);
}

export function queryHasExclusionCue(text: string): boolean {
  return EXCLUSION_CUE.test(text);
}
