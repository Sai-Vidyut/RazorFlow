#!/usr/bin/env npx tsx
/**
 * Generates deterministic Northline product SVGs in public/products/.
 * Core four SKUs keep their existing PNG photography — this script only
 * writes SVGs for expanded catalog items.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  NORTLINE_CORE_PNG_SKUS,
  NORTLINE_PRODUCT_VISUALS,
  type ProductVisualTemplate,
} from "../prisma/northline-product-images";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public/products");

const CANVAS = "#E8EEF2";
const INK = "#101820";
const MUTED = "#5C6873";
const ACCENT = "#0B5F5A";

function skuAccent(sku: string): string {
  let hash = 0;
  for (const char of sku) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hues = ["#0B5F5A", "#0E6B65", "#124E78", "#1F5C4D", "#2A4A52", "#3D6B62"];
  return hues[hash % hues.length]!;
}

function wrap(sku: string, name: string, body: string): string {
  const accent = skuAccent(sku);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" role="img" aria-label="${name.replace(/"/g, "&quot;")}">
  <rect width="640" height="640" fill="${CANVAS}"/>
  <circle cx="520" cy="120" r="180" fill="${accent}" opacity="0.08"/>
  ${body}
  <text x="32" y="598" font-family="system-ui, sans-serif" font-size="18" fill="${MUTED}" letter-spacing="0.04em">NORTHLINE</text>
  <text x="32" y="622" font-family="ui-monospace, monospace" font-size="14" fill="${MUTED}">${sku}</text>
</svg>`;
}

const TEMPLATES: Record<ProductVisualTemplate, (accent: string) => string> = {
  "headphones-open": (a) => `
  <ellipse cx="320" cy="300" rx="200" ry="210" fill="${INK}" opacity="0.92"/>
  <ellipse cx="180" cy="300" rx="95" ry="115" fill="${a}"/>
  <ellipse cx="460" cy="300" rx="95" ry="115" fill="${a}"/>
  <rect x="215" y="250" width="210" height="18" rx="9" fill="${INK}" opacity="0.35"/>
  <ellipse cx="180" cy="300" rx="55" ry="70" fill="${CANVAS}" opacity="0.35"/>
  <ellipse cx="460" cy="300" rx="55" ry="70" fill="${CANVAS}" opacity="0.35"/>`,
  "headphones-over-ear": (a) => `
  <path d="M140 290c0-95 80-170 180-170s180 75 180 170v70c0 35-28 63-63 63h-24c-35 0-63-28-63-63v-45h-48v45c0 35-28 63-63 63h-24c-35 0-63-28-63-63v-70z" fill="${INK}" opacity="0.9"/>
  <ellipse cx="180" cy="300" rx="78" ry="92" fill="${a}"/>
  <ellipse cx="460" cy="300" rx="78" ry="92" fill="${a}"/>
  <ellipse cx="180" cy="300" rx="42" ry="52" fill="${CANVAS}" opacity="0.28"/>
  <ellipse cx="460" cy="300" rx="42" ry="52" fill="${CANVAS}" opacity="0.28"/>`,
  "headphones-fold": (a) => `
  <g transform="rotate(-12 320 320)">
    <ellipse cx="220" cy="290" rx="88" ry="105" fill="${a}"/>
    <ellipse cx="420" cy="330" rx="88" ry="105" fill="${INK}" opacity="0.85"/>
    <rect x="285" y="255" width="70" height="120" rx="12" fill="${INK}" opacity="0.55"/>
  </g>`,
  "earbuds-tws": (a) => `
  <rect x="215" y="250" width="210" height="140" rx="36" fill="${INK}" opacity="0.88"/>
  <ellipse cx="270" cy="210" rx="34" ry="42" fill="${a}"/>
  <ellipse cx="370" cy="210" rx="34" ry="42" fill="${a}"/>
  <rect x="248" y="285" width="24" height="8" rx="4" fill="${CANVAS}" opacity="0.5"/>
  <rect x="368" y="285" width="24" height="8" rx="4" fill="${CANVAS}" opacity="0.5"/>`,
  "earbuds-sport": (a) => `
  <ellipse cx="250" cy="290" rx="38" ry="48" fill="${a}"/>
  <ellipse cx="390" cy="290" rx="38" ry="48" fill="${a}"/>
  <path d="M220 260c-25-40 10-85 55-70" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/>
  <path d="M420 260c25-40-10-85-55-70" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/>
  <rect x="230" y="340" width="180" height="70" rx="24" fill="${INK}" opacity="0.75"/>`,
  "earbuds-open": (a) => `
  <path d="M250 320c0-60 35-95 70-95s70 35 70 95" stroke="${a}" stroke-width="22" fill="none" stroke-linecap="round"/>
  <path d="M390 320c0-60 35-95 70-95" stroke="${INK}" stroke-width="22" fill="none" stroke-linecap="round" opacity="0.8"/>
  <circle cx="250" cy="320" r="16" fill="${a}"/>
  <circle cx="390" cy="320" r="16" fill="${INK}" opacity="0.8"/>`,
  "earbuds-iem": (a) => `
  <circle cx="250" cy="280" r="42" fill="${a}"/>
  <circle cx="390" cy="280" r="42" fill="${INK}" opacity="0.85"/>
  <path d="M250 322c-40 80-80 120-120 160" stroke="${INK}" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M390 322c40 80 80 120 120 160" stroke="${INK}" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  "earbuds-wired": (a) => `
  <circle cx="320" cy="250" r="36" fill="${a}"/>
  <rect x="305" y="286" width="30" height="18" rx="6" fill="${INK}" opacity="0.8"/>
  <path d="M320 304v120" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
  <rect x="300" y="430" width="40" height="16" rx="4" fill="${INK}"/>`,
  "speaker-portable": (a) => `
  <rect x="230" y="210" width="180" height="220" rx="90" fill="${INK}" opacity="0.88"/>
  <circle cx="320" cy="320" r="58" fill="${a}"/>
  <circle cx="320" cy="320" r="28" fill="${CANVAS}" opacity="0.35"/>`,
  "speaker-rugged": (a) => `
  <rect x="210" y="230" width="220" height="180" rx="36" fill="${INK}" opacity="0.9"/>
  <rect x="240" y="260" width="160" height="120" rx="18" fill="${a}"/>
  <path d="M320 170v40M320 410v40" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
  <circle cx="320" cy="320" r="34" fill="${CANVAS}" opacity="0.35"/>`,
  "speaker-party": (a) => `
  <rect x="190" y="190" width="260" height="260" rx="130" fill="${INK}" opacity="0.9"/>
  <circle cx="320" cy="320" r="88" fill="${a}"/>
  <circle cx="320" cy="320" r="48" fill="${CANVAS}" opacity="0.25"/>
  <circle cx="320" cy="320" r="18" fill="${CANVAS}" opacity="0.45"/>`,
  "speaker-bookshelf": (a) => `
  <rect x="170" y="220" width="120" height="200" rx="8" fill="${a}"/>
  <rect x="350" y="220" width="120" height="200" rx="8" fill="${INK}" opacity="0.85"/>
  <circle cx="230" cy="320" r="36" fill="${CANVAS}" opacity="0.3"/>
  <circle cx="410" cy="320" r="36" fill="${CANVAS}" opacity="0.3"/>`,
  "speaker-desk": (a) => `
  <rect x="180" y="260" width="110" height="160" rx="10" fill="${a}"/>
  <rect x="350" y="260" width="110" height="160" rx="10" fill="${INK}" opacity="0.85"/>
  <rect x="260" y="400" width="120" height="16" rx="4" fill="${MUTED}"/>`,
  soundbar: (a) => `
  <rect x="120" y="280" width="400" height="80" rx="18" fill="${INK}" opacity="0.9"/>
  <rect x="150" y="300" width="340" height="40" rx="8" fill="${a}"/>
  <rect x="420" y="390" width="100" height="100" rx="12" fill="${INK}" opacity="0.75"/>
  <circle cx="470" cy="440" r="28" fill="${a}"/>`,
  "soundbar-slim": (a) => `
  <rect x="100" y="300" width="440" height="48" rx="12" fill="${INK}" opacity="0.88"/>
  <rect x="130" y="314" width="380" height="20" rx="6" fill="${a}"/>`,
  "case-hard": (a) => `
  <rect x="190" y="210" width="260" height="220" rx="28" fill="${INK}" opacity="0.88"/>
  <rect x="220" y="240" width="200" height="160" rx="16" fill="${a}" opacity="0.85"/>
  <rect x="300" y="210" width="40" height="220" rx="4" fill="${CANVAS}" opacity="0.2"/>`,
  "case-soft": (a) => `
  <path d="M200 250c40-40 200-40 240 0v170c-40 40-200 40-240 0V250z" fill="${a}" opacity="0.85"/>
  <path d="M230 280h180" stroke="${INK}" stroke-width="6" opacity="0.25" stroke-linecap="round"/>`,
  "case-silicone": (a) => `
  <rect x="240" y="250" width="160" height="140" rx="32" fill="${a}" opacity="0.9"/>
  <rect x="260" y="270" width="120" height="100" rx="24" fill="${INK}" opacity="0.15"/>`,
  "case-earbud": (a) => `
  <rect x="250" y="260" width="140" height="120" rx="20" fill="${INK}" opacity="0.88"/>
  <rect x="270" y="280" width="100" height="80" rx="14" fill="${a}"/>`,
  "charger-gan": (a) => `
  <rect x="250" y="230" width="140" height="180" rx="22" fill="${INK}" opacity="0.9"/>
  <rect x="280" y="260" width="36" height="36" rx="8" fill="${a}"/>
  <rect x="324" y="260" width="36" height="36" rx="8" fill="${a}"/>
  <path d="M320 410v50" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`,
  "charger-travel": (a) => `
  <rect x="270" y="240" width="100" height="160" rx="16" fill="${a}"/>
  <rect x="290" y="400" width="20" height="40" rx="4" fill="${INK}"/>
  <rect x="330" y="400" width="20" height="40" rx="4" fill="${INK}"/>`,
  "cable-audio": (a) => `
  <path d="M180 320c80-80 200-80 280 0" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/>
  <rect x="150" y="300" width="40" height="40" rx="8" fill="${a}"/>
  <circle cx="470" cy="320" r="22" fill="${INK}" opacity="0.85"/>
  <circle cx="470" cy="320" r="8" fill="${a}"/>`,
  "cable-braided": (a) => `
  <path d="M160 360c120-120 200-120 320 0" stroke="${a}" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M160 380c120-100 200-100 320 20" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.45"/>
  <rect x="130" y="340" width="36" height="36" rx="8" fill="${INK}"/>
  <rect x="474" y="340" width="36" height="36" rx="8" fill="${INK}"/>`,
  "adapter-bt": (a) => `
  <circle cx="320" cy="300" r="70" fill="${INK}" opacity="0.88"/>
  <circle cx="320" cy="300" r="42" fill="${a}"/>
  <rect x="305" y="370" width="30" height="60" rx="6" fill="${INK}"/>`,
  "adapter-dac": (a) => `
  <rect x="260" y="290" width="120" height="44" rx="10" fill="${INK}" opacity="0.9"/>
  <rect x="280" y="302" width="80" height="20" rx="4" fill="${a}"/>
  <circle cx="410" cy="312" r="14" fill="${INK}"/>`,
  tips: (a) => `
  <ellipse cx="250" cy="320" rx="36" ry="48" fill="${a}"/>
  <ellipse cx="320" cy="320" rx="36" ry="48" fill="${INK}" opacity="0.75"/>
  <ellipse cx="390" cy="320" rx="36" ry="48" fill="${a}" opacity="0.65"/>`,
  stand: (a) => `
  <path d="M220 420h200" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
  <path d="M260 420V260c0-30 25-55 55-55h10c30 0 55 25 55 55v160" stroke="${a}" stroke-width="12" fill="none"/>
  <path d="M380 420V260c0-30 25-55 55-55h10c30 0 55 25 55 55v160" stroke="${INK}" stroke-width="12" fill="none" opacity="0.75"/>`,
  sleeve: (a) => `
  <path d="M210 250h220c20 0 36 16 36 36v108c0 20-16 36-36 36H210c-20 0-36-16-36-36V286c0-20 16-36 36-36z" fill="${a}" opacity="0.88"/>
  <path d="M230 290h180" stroke="${INK}" stroke-width="4" opacity="0.2" stroke-linecap="round"/>`,
};

function displayNameForSku(sku: string): string {
  return sku
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  let written = 0;

  for (const [sku, template] of Object.entries(NORTLINE_PRODUCT_VISUALS)) {
    if ((NORTLINE_CORE_PNG_SKUS as readonly string[]).includes(sku)) {
      continue;
    }
    const accent = skuAccent(sku);
    const body = TEMPLATES[template](accent);
    const svg = wrap(sku, displayNameForSku(sku), body);
    const outPath = path.join(OUT_DIR, `${sku}.svg`);
    writeFileSync(outPath, svg, "utf8");
    written += 1;
  }

  console.log(`Generated ${written} Northline product SVGs in public/products/`);
}

main();
