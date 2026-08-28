import type { Product } from "./types";

/** Canonical Northline catalog categories used for deterministic filtering. */
export type CatalogCategory =
  | "earbuds"
  | "headphones"
  | "speaker"
  | "soundbar"
  | "accessory"
  | "outdoor";

const CATEGORY_ALIASES: Record<CatalogCategory, readonly string[]> = {
  earbuds: ["earbuds", "earbud", "earphones", "earphone", "in-ear", "in ear"],
  headphones: ["headphones", "headphone", "over-ear", "over ear", "headset"],
  speaker: ["speaker", "speakers", "bluetooth speaker", "portable speaker"],
  soundbar: ["soundbar", "soundbars", "tv soundbar"],
  accessory: ["accessory", "accessories", "case", "cable", "charger"],
  outdoor: ["outdoor", "backpack", "bag"],
};

export function normalizeIntentCategory(category: string | null): CatalogCategory | null {
  if (!category) return null;
  const token = category.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(CATEGORY_ALIASES) as Array<
    [CatalogCategory, readonly string[]]
  >) {
    if (aliases.some((alias) => alias === token || token.includes(alias) || alias.includes(token))) {
      return canonical;
    }
  }
  return null;
}

/** Strict equality on canonical category — never cross-match speaker vs soundbar vs earbuds. */
export function productMatchesCategory(product: Product, category: CatalogCategory): boolean {
  return product.category.trim().toLowerCase() === category;
}

export function inferCategoryFromQuery(query: string): CatalogCategory | null {
  const text = query.toLowerCase();

  if (/\bsoundbar|\btv soundbar/i.test(text)) {
    return "soundbar";
  }
  if (/\bearphone|\bearbud|\bin-ear|\bbuds\b|\bwireless earphone/i.test(text)) {
    return "earbuds";
  }
  if (/\bheadphone|\bover-ear|\bheadset|\bover ear/i.test(text)) {
    return "headphones";
  }
  if (/\bbluetooth speaker|\bportable speaker|\bspeakers?\b/i.test(text) && !/\bsoundbar/i.test(text)) {
    return "speaker";
  }
  if (/\bbackpack|\bbag|\boutdoor/i.test(text)) {
    return "outdoor";
  }
  if (/\bcase|\baccessory|\bcable|\bcharger/i.test(text)) {
    return "accessory";
  }

  return null;
}
