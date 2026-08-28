/** Original hero product photography — paths must not change. */
export const NORTLINE_CORE_PNG_SKUS = [
  "halo-anc",
  "halo-case",
  "drift-buds",
  "field-speaker",
] as const;

export type ProductVisualTemplate =
  | "headphones-open"
  | "headphones-over-ear"
  | "headphones-fold"
  | "earbuds-tws"
  | "earbuds-sport"
  | "earbuds-open"
  | "earbuds-iem"
  | "earbuds-wired"
  | "speaker-portable"
  | "speaker-rugged"
  | "speaker-party"
  | "speaker-bookshelf"
  | "speaker-desk"
  | "soundbar"
  | "soundbar-slim"
  | "case-hard"
  | "case-soft"
  | "case-silicone"
  | "case-earbud"
  | "charger-gan"
  | "charger-travel"
  | "cable-audio"
  | "cable-braided"
  | "adapter-bt"
  | "adapter-dac"
  | "tips"
  | "stand"
  | "sleeve";

/** Deterministic visual template per expanded SKU. */
export const NORTLINE_PRODUCT_VISUALS: Record<string, ProductVisualTemplate> = {
  "studio-open": "headphones-open",
  "commute-lite": "headphones-over-ear",
  "bassline-over": "headphones-over-ear",
  "transit-max-anc": "headphones-over-ear",
  "quietcore-fold": "headphones-fold",
  "cabin-comfort-anc": "headphones-over-ear",
  "drift-sport": "earbuds-sport",
  "drift-mini": "earbuds-tws",
  "drift-pro": "earbuds-tws",
  "drift-open": "earbuds-open",
  "pulse-buds": "earbuds-tws",
  "canal-pro-iem": "earbuds-iem",
  "stage-monitor": "earbuds-iem",
  "daily-wired": "earbuds-wired",
  "field-mini": "speaker-portable",
  "field-rugged": "speaker-rugged",
  "field-party": "speaker-party",
  "tide-speaker": "speaker-rugged",
  "shelf-one": "speaker-bookshelf",
  "room-fill": "speaker-bookshelf",
  "desk-wave": "speaker-desk",
  "arc-soundbar": "soundbar",
  "arc-slim": "soundbar-slim",
  "transit-shell": "case-hard",
  "studio-pouch": "case-soft",
  "drift-case-s": "case-silicone",
  "drift-case-hard": "case-earbud",
  "dual-dock": "charger-gan",
  "travel-charge-20w": "charger-travel",
  "usbc-audio-cable": "cable-audio",
  "braided-usbc-2m": "cable-braided",
  "bt-aux-adapter": "adapter-bt",
  "usbc-dac-lite": "adapter-dac",
  "memory-foam-tips": "tips",
  "stand-dual": "stand",
  "leather-carry": "sleeve",
};

export function northlineProductImage(sku: string): string {
  if ((NORTLINE_CORE_PNG_SKUS as readonly string[]).includes(sku)) {
    return `/products/${sku}.png`;
  }
  return `/products/${sku}.svg`;
}

export function northlineProductVisual(sku: string): ProductVisualTemplate {
  const visual = NORTLINE_PRODUCT_VISUALS[sku];
  if (!visual) {
    throw new Error(`Missing visual template for SKU: ${sku}`);
  }
  return visual;
}
