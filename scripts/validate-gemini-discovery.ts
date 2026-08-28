#!/usr/bin/env tsx
/**
 * Live Gemini + deterministic discovery validation.
 * Run: npm run validate:gemini-discovery
 * Requires GEMINI_API_KEY and DATABASE_URL (catalog).
 */
import dotenv from "dotenv";
import path from "path";
import { extractIntent } from "../src/lib/agent/intent";
import { discoverProductsWithMeta } from "../src/lib/agent/discover-catalog";
import { resolveDiscoveryMode } from "../src/lib/agent/intent-discovery-policy";
import { runAgentWithParsed } from "../src/lib/agent/run-agent";
import { getConfiguredDemoMerchantId } from "../src/lib/config/merchant";
import { getAvailableCatalog } from "../src/lib/services/catalog";
import { getMerchantPoliciesForAgent } from "../src/lib/services/policies";

dotenv.config({ path: path.join(process.cwd(), ".env") });
const cliGeminiModel = process.env.GEMINI_MODEL;
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });
if (cliGeminiModel) {
  process.env.GEMINI_MODEL = cliGeminiModel;
}

const QUERIES = [
  "show me headphones",
  "show me 4 headphones cheapest first",
  "show me headphones under 3k",
  "good headphones under 3k except Commute Lite",
  "Northline Halo ANC",
  "Halo ANC under 5k",
  "show me earphones",
  "show me headphones from cheapest to most expensive",
  "show me some good headphones for travel",
  "I want something for long flights under 10k",
];

type Check = { label: string; pass: boolean; detail: string };

function inrFromPaise(paise: number | null): string {
  return paise == null ? "null" : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

function summarizeIntent(query: string, source: string, intent: Awaited<ReturnType<typeof extractIntent>>["intent"]) {
  return {
    query,
    source,
    category: intent.category,
    mode: intent.discovery.mode ?? resolveDiscoveryMode(intent),
    resultCount: intent.discovery.resultCount,
    minResults: intent.discovery.minResults,
    sortBy: intent.discovery.sortBy,
    sortOrder: intent.discovery.sortOrder,
    maxBudget: inrFromPaise(intent.constraints.maxPricePaise),
    exclusions: intent.exclusions.map((e) => e.reference),
    keywords: intent.preferences.keywords,
    useCase: intent.useCase,
  };
}

function checkCategory(intent: Awaited<ReturnType<typeof extractIntent>>["intent"], expected: string | null): Check {
  const pass = intent.category === expected;
  return { label: "category", pass, detail: `expected ${expected}, got ${intent.category}` };
}

function checkMode(intent: Awaited<ReturnType<typeof extractIntent>>["intent"], expected: "browse" | "single"): Check {
  const mode = intent.discovery.mode ?? resolveDiscoveryMode(intent);
  const pass = mode === expected;
  return { label: "discovery.mode", pass, detail: `expected ${expected}, got ${mode}` };
}

function checkMaxBudget(intent: Awaited<ReturnType<typeof extractIntent>>["intent"], expectedInr: number | null): Check {
  const actual = intent.constraints.maxPricePaise == null ? null : Math.round(intent.constraints.maxPricePaise / 100);
  const pass = actual === expectedInr;
  return { label: "maxBudget", pass, detail: `expected ${expectedInr}, got ${actual}` };
}

function checkExclusions(intent: Awaited<ReturnType<typeof extractIntent>>["intent"], includes: string): Check {
  const pass = intent.exclusions.some((e) => e.reference.toLowerCase().includes(includes.toLowerCase()));
  return { label: "exclusions", pass, detail: `expected reference containing "${includes}", got ${JSON.stringify(intent.exclusions.map((e) => e.reference))}` };
}

function checkSort(intent: Awaited<ReturnType<typeof extractIntent>>["intent"], sortBy: "price" | null, sortOrder: "asc" | "desc"): Check {
  const pass = intent.discovery.sortBy === sortBy && intent.discovery.sortOrder === sortOrder;
  return {
    label: "sort",
    pass,
    detail: `expected sortBy=${sortBy} sortOrder=${sortOrder}, got sortBy=${intent.discovery.sortBy} sortOrder=${intent.discovery.sortOrder}`,
  };
}

function checkResultCount(intent: Awaited<ReturnType<typeof extractIntent>>["intent"], expected: number | null): Check {
  const pass = intent.discovery.resultCount === expected;
  return { label: "resultCount", pass, detail: `expected ${expected}, got ${intent.discovery.resultCount}` };
}

function checkProductsInCategory(products: { category: string }[], category: string): Check {
  const pass = products.every((p) => p.category === category);
  return { label: "catalog.category", pass, detail: `${products.length} products, all ${category}: ${pass}` };
}

function checkBudgetHard(products: { price: number }[], maxInr: number | null): Check {
  if (maxInr == null) return { label: "catalog.budget", pass: true, detail: "no budget constraint" };
  const pass = products.every((p) => p.price <= maxInr);
  return { label: "catalog.budget", pass, detail: `all <= ₹${maxInr}: ${pass}` };
}

function checkExcluded(products: { sku: string }[], sku: string): Check {
  const pass = !products.some((p) => p.sku === sku);
  return { label: "catalog.exclusion", pass, detail: `${sku} absent: ${pass}` };
}

function checkExactSkus(products: { sku: string }[], skus: string[]): Check {
  const actual = products.map((p) => p.sku);
  const pass = actual.length === skus.length && skus.every((sku, i) => actual[i] === sku);
  return { label: "catalog.exact", pass, detail: `expected ${JSON.stringify(skus)}, got ${JSON.stringify(actual)}` };
}

function checkEmpty(products: unknown[], status: string): Check {
  const pass = products.length === 0 && status === "empty";
  return { label: "empty", pass, detail: `products=${products.length} status=${status}` };
}

async function extractWithGemini(query: string, attempts = 4): Promise<Awaited<ReturnType<typeof extractIntent>>> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const extracted = await extractIntent(query);
    if (extracted.source === "gemini") return extracted;
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }
  return extractIntent(query);
}

async function validateQuery(
  query: string,
  catalog: Awaited<ReturnType<typeof getAvailableCatalog>>,
  policies: Awaited<ReturnType<typeof getMerchantPoliciesForAgent>>,
  expectations: (ctx: {
    intent: Awaited<ReturnType<typeof extractIntent>>["intent"];
    source: string;
    products: Awaited<ReturnType<typeof discoverProductsWithMeta>>["products"];
    agentStatus: string;
  }) => Check[],
) {
  const extracted = await extractWithGemini(query);
  if (extracted.source !== "gemini") {
    console.log(`\n=== FAIL (not Gemini): ${query}`);
    console.log(`source=${extracted.source} reason=${extracted.fallbackReason ?? "n/a"}`);
    return false;
  }

  const meta = discoverProductsWithMeta(extracted.intent, catalog);
  const agent = runAgentWithParsed(extracted.intent, policies, catalog);

  console.log(`\n=== ${query}`);
  console.log(JSON.stringify(summarizeIntent(query, extracted.source, extracted.intent), null, 2));
  console.log(
    `discovery: returned=${meta.returnedCount} totalMatches=${meta.totalMatches} skus=${meta.products.map((p) => p.sku).join(", ") || "(none)"}`,
  );
  console.log(`agent: status=${agent.status} primary=${agent.primary?.sku ?? "null"}`);

  const checks = expectations({
    intent: extracted.intent,
    source: extracted.source,
    products: meta.products,
    agentStatus: agent.status,
  });

  let allPass = true;
  for (const check of checks) {
    const mark = check.pass ? "PASS" : "FAIL";
    console.log(`  [${mark}] ${check.label}: ${check.detail}`);
    if (!check.pass) allPass = false;
  }

  return allPass;
}

async function runCase(
  results: boolean[],
  catalog: Awaited<ReturnType<typeof getAvailableCatalog>>,
  policies: Awaited<ReturnType<typeof getMerchantPoliciesForAgent>>,
  query: string,
  expectations: Parameters<typeof validateQuery>[3],
) {
  if (results.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  results.push(await validateQuery(query, catalog, policies, expectations));
}

async function main() {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.error("GEMINI_API_KEY is required");
    process.exit(1);
  }

  console.log(`Using Gemini model: ${process.env.GEMINI_MODEL ?? "default"}`);

  const merchantId = getConfiguredDemoMerchantId();
  const catalog = await getAvailableCatalog(merchantId);
  const policies = await getMerchantPoliciesForAgent(merchantId);

  const results: boolean[] = [];

  await runCase(results, catalog, policies, "show me headphones", ({ intent, products }) => [
    checkCategory(intent, "headphones"),
    checkMode(intent, "browse"),
    checkProductsInCategory(products, "headphones"),
  ]);

  await runCase(results, catalog, policies, "show me 4 headphones cheapest first", ({ intent, products }) => [
    checkCategory(intent, "headphones"),
    checkMode(intent, "browse"),
    checkResultCount(intent, 4),
    checkSort(intent, "price", "asc"),
    checkProductsInCategory(products, "headphones"),
  ]);

  await runCase(results, catalog, policies, "show me headphones under 3k", ({ intent, products }) => [
    checkCategory(intent, "headphones"),
    checkMode(intent, "browse"),
    checkMaxBudget(intent, 3000),
    checkProductsInCategory(products, "headphones"),
    checkBudgetHard(products, 3000),
  ]);

  await runCase(
    results,
    catalog,
    policies,
    "good headphones under 3k except Commute Lite",
    ({ intent, products, agentStatus }) => [
      checkCategory(intent, "headphones"),
      checkMaxBudget(intent, 3000),
      checkExclusions(intent, "Commute Lite"),
      checkEmpty(products, agentStatus),
    ],
  );

  await runCase(results, catalog, policies, "Northline Halo ANC", ({ intent, products }) => [
    checkMode(intent, "single"),
    checkExactSkus(products, ["halo-anc"]),
  ]);

  await runCase(results, catalog, policies, "Halo ANC under 5k", ({ intent, products, agentStatus }) => [
    checkMaxBudget(intent, 5000),
    checkEmpty(products, agentStatus),
  ]);

  await runCase(results, catalog, policies, "show me earphones", ({ intent, products }) => [
    checkCategory(intent, "earbuds"),
    checkMode(intent, "browse"),
    checkProductsInCategory(products, "earbuds"),
  ]);

  await runCase(
    results,
    catalog,
    policies,
    "show me headphones from cheapest to most expensive",
    ({ intent, products }) => [
      checkCategory(intent, "headphones"),
      checkSort(intent, "price", "asc"),
      checkProductsInCategory(products, "headphones"),
    ],
  );

  await runCase(results, catalog, policies, "show me some good headphones for travel", ({ intent, products }) => [
    checkCategory(intent, "headphones"),
    checkMode(intent, "browse"),
    checkProductsInCategory(products, "headphones"),
  ]);

  await runCase(results, catalog, policies, "I want something for long flights under 10k", ({ intent, products }) => [
    checkCategory(intent, "headphones"),
    checkMaxBudget(intent, 10000),
    checkProductsInCategory(products, "headphones"),
    checkBudgetHard(products, 10000),
  ]);

  const passed = results.filter(Boolean).length;
  console.log(`\n=== SUMMARY: ${passed}/${results.length} queries passed validation`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
