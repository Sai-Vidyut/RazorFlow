import { discoverProductsWithMeta, isMultiProductDiscovery } from "./discover-catalog";
import type { CatalogCategory } from "./category-match";
import { findProduct, marginPct } from "./parse-intent";
import { rankProducts, recommendationReason } from "./match-catalog";
import type { StructuredIntent } from "./structured-intent";
import { intentMaxBudgetInr } from "./structured-intent";
import type {
  AgentExplanation,
  AgentResult,
  MerchantPolicies,
  Product,
} from "./types";

function discounted(price: number, pct: number) {
  return Math.round(price * (1 - pct / 100));
}

function insufficientInventoryResult(
  intent: StructuredIntent,
  primary: Product,
  quantity: number,
): AgentResult {
  return {
    status: "blocked",
    intent,
    primary,
    attach: null,
    results: [primary],
    discoverySummary: null,
    discountPct: 0,
    subtotal: primary.price * quantity,
    marginPct: marginPct(primary.price, primary.cost),
    aovLift: 0,
    explanations: [
      {
        decision: "Offer blocked",
        reason: "Offer blocked because requested quantity exceeds available inventory.",
        evidence: `${primary.name} has ${primary.inventory} in stock, ${quantity} requested`,
      },
    ],
    policies: [
      {
        id: "inventory",
        label: "Inventory",
        result: "blocked",
        detail: `Requested ${quantity}, available ${primary.inventory}`,
      },
    ],
    blockedReason: "Requested quantity exceeds available inventory.",
  };
}

function formatExclusionSuffix(intent: StructuredIntent, catalog: Product[]): string {
  const resolved = intent.exclusions.filter((entry) => entry.resolvedSku);
  if (resolved.length === 0) return "";

  const names = resolved.map((entry) => {
    const product = catalog.find((item) => item.sku === entry.resolvedSku);
    return product?.name ?? entry.reference;
  });

  if (names.length === 1) return ` after excluding ${names[0]}`;
  if (names.length === 2) return ` after excluding ${names[0]} and ${names[1]}`;
  return ` after excluding ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function emptyDiscoveryMessage(
  intent: StructuredIntent,
  maxBudgetInr: number | null,
  category: CatalogCategory | null,
  catalog: Product[],
): string {
  const exclusionSuffix = formatExclusionSuffix(intent, catalog);
  const categoryLabel = category ?? intent.category;
  if (!categoryLabel) {
    if (maxBudgetInr != null) {
      return `Could not determine a product category for this request. Try naming headphones, earbuds, or another product type under ₹${maxBudgetInr.toLocaleString("en-IN")}.`;
    }
    return "Could not determine a product category for this request. Try naming a product type such as headphones or earbuds.";
  }
  if (maxBudgetInr != null && categoryLabel) {
    return `No ${categoryLabel} available under ₹${maxBudgetInr.toLocaleString("en-IN")}${exclusionSuffix}.`;
  }
  if (maxBudgetInr != null) {
    return `No products available under ₹${maxBudgetInr.toLocaleString("en-IN")}${exclusionSuffix}.`;
  }
  if (categoryLabel && exclusionSuffix) {
    return `No ${categoryLabel} matched this request${exclusionSuffix}.`;
  }
  if (categoryLabel) {
    return `No ${categoryLabel} matched this request in the catalog.`;
  }
  return "Nothing in the merchant catalog fits the stated constraints.";
}

function emptyResult(
  intent: StructuredIntent,
  maxBudgetInr: number | null,
  category: CatalogCategory | null,
  catalog: Product[],
): AgentResult {
  const reason = emptyDiscoveryMessage(intent, maxBudgetInr, category, catalog);
  return {
    status: "empty",
    intent,
    primary: null,
    attach: null,
    results: [],
    discoverySummary: null,
    discountPct: 0,
    subtotal: 0,
    marginPct: 0,
    aovLift: 0,
    explanations: [
      {
        decision: "No catalog match",
        reason,
        evidence: maxBudgetInr != null ? `Budget ₹${maxBudgetInr.toLocaleString("en-IN")}` : "No matching products",
      },
    ],
    policies: [],
    blockedReason: null,
  };
}

export function runAgentWithParsed(
  rawIntent: StructuredIntent,
  policies: MerchantPolicies,
  catalog: Product[],
): AgentResult {
  const discovery = discoverProductsWithMeta(rawIntent, catalog);
  const intent = discovery.intent;
  const quantity = intent.quantity;
  const maxBudgetInr = intentMaxBudgetInr(intent);
  const discountAsk = intent.constraints.maxDiscountPct;
  const explanations: AgentExplanation[] = [];
  const policiesOut: AgentResult["policies"] = [];

  const primary = discovery.products[0] ?? null;
  const results = discovery.products;
  const discoverySummary = {
    totalMatches: discovery.totalMatches,
    returnedCount: discovery.returnedCount,
    requestedCount: discovery.requestedCount,
    sortBy: discovery.sortBy,
    sortOrder: discovery.sortOrder,
    category: discovery.category,
  };

  if (!primary) {
    return emptyResult(intent, maxBudgetInr, discovery.category, catalog);
  }

  if (primary.inventory < quantity) {
    return insufficientInventoryResult(intent, primary, quantity);
  }

  if (discountAsk != null && discountAsk > policies.maxDiscountPct) {
    policiesOut.push({
      id: "discount",
      label: "Discount ceiling",
      result: "blocked",
      detail: `Asked ${discountAsk}%. Merchant cap is ${policies.maxDiscountPct}%.`,
    });
    return {
      status: "blocked",
      intent,
      primary,
      attach: null,
      results,
      discoverySummary,
      discountPct: 0,
      subtotal: primary.price * quantity,
      marginPct: marginPct(primary.price, primary.cost),
      aovLift: 0,
      explanations: [
        {
          decision: "Offer blocked",
          reason: `Offer blocked because it exceeds the merchant's configured discount limit of ${policies.maxDiscountPct}%.`,
          evidence: `${discountAsk}% requested on ${primary.name}`,
        },
      ],
      policies: policiesOut,
      blockedReason: `Discount of ${discountAsk}% is above the ${policies.maxDiscountPct}% ceiling.`,
    };
  }

  const discountPct =
    discountAsk != null && discountAsk <= policies.maxDiscountPct ? discountAsk : 0;

  let attach: Product | null = null;
  const minAttachRate = policies.minAttachRatePct / 100;
  if (
    !isMultiProductDiscovery(intent, results.length) &&
    policies.allowCrossSell &&
    primary.attachSku &&
    (primary.attachRate ?? 0) >= minAttachRate
  ) {
    const candidate = findProduct(catalog, primary.attachSku);
    if (candidate && candidate.active && candidate.inventory >= quantity) {
      attach = candidate;
      explanations.push({
        decision: "Accessory suggested",
        reason: `Accessory suggested because this item has a high attach rate (${Math.round((primary.attachRate ?? 0) * 100)}%). Add it to cart if the buyer wants it.`,
        evidence: `${candidate.name} attach rate ${Math.round((primary.attachRate ?? 0) * 100)}%`,
      });
    }
  }

  const primaryLine = discounted(primary.price, discountPct) * quantity;
  const attachLine = attach ? attach.price * quantity : 0;
  const subtotal = primaryLine;
  const cost = primary.cost * quantity;
  const margin = marginPct(subtotal, cost);

  policiesOut.push({
    id: "budget",
    label: "Budget fit",
    result:
      !policies.requireBudgetFit || maxBudgetInr == null || subtotal <= maxBudgetInr
        ? "allowed"
        : "blocked",
    detail: maxBudgetInr ? `Primary ${subtotal} against ${maxBudgetInr}` : "No budget stated",
  });
  policiesOut.push({
    id: "margin",
    label: "Margin floor",
    result: margin >= policies.minMarginPct ? "allowed" : "blocked",
    detail: `${margin.toFixed(1)}% vs ${policies.minMarginPct}% floor`,
  });
  policiesOut.push({
    id: "order-cap",
    label: "Order cap",
    result: subtotal <= policies.maxOrderInr ? "allowed" : "blocked",
    detail: `Cap ${policies.maxOrderInr}`,
  });
  policiesOut.push({
    id: "attach",
    label: "Cross-sell rule",
    result: "allowed",
    detail: attach ? "Accessory suggested, not added to cart" : "No attach suggestion",
  });
  policiesOut.push({
    id: "inventory",
    label: "Inventory",
    result: "allowed",
    detail: `Quantity ${quantity} within stock for selected products`,
  });

  const blocked = policiesOut.find((item) => item.result === "blocked");
  if (maxBudgetInr != null && subtotal > maxBudgetInr && policies.requireBudgetFit) {
    return {
      status: "blocked",
      intent,
      primary,
      attach: null,
      results,
      discoverySummary,
      discountPct,
      subtotal: primaryLine,
      marginPct: marginPct(primaryLine, primary.cost * quantity),
      aovLift: 0,
      explanations: [
        {
          decision: "Offer blocked",
          reason: "Offer blocked because the primary product exceeds the customer's stated budget.",
          evidence: `Budget ${maxBudgetInr}, primary would be ${subtotal}`,
        },
      ],
      policies: policiesOut,
      blockedReason: "Primary product is above the stated budget.",
    };
  }

  if (blocked) {
    return {
      status: "blocked",
      intent,
      primary,
      attach: null,
      results,
      discoverySummary,
      discountPct,
      subtotal: primaryLine,
      marginPct: margin,
      aovLift: 0,
      explanations: [
        {
          decision: "Offer blocked",
          reason: blocked.detail,
          evidence: blocked.label,
        },
      ],
      policies: policiesOut,
      blockedReason: blocked.detail,
    };
  }

  if (isMultiProductDiscovery(intent, results.length)) {
    const requested = discoverySummary.requestedCount;
    const partial =
      requested != null && results.length < requested
        ? ` Only ${results.length} matching options are available in catalog.`
        : discoverySummary.totalMatches > results.length
          ? ` Showing ${results.length} of ${discoverySummary.totalMatches} matches.`
          : "";
    explanations.unshift({
      decision: "Products matched",
      reason: `${results.length} catalog option${results.length === 1 ? "" : "s"} matched your request.${partial}`,
      evidence: results.map((product) => product.name).join(", "),
    });
  } else {
    explanations.unshift({
      decision: "Recommended",
      reason: recommendationReason(primary, intent),
      evidence:
        maxBudgetInr != null ? `List ${primary.price} inside ${maxBudgetInr}` : primary.blurb,
    });
  }

  return {
    status: "ready",
    intent,
    primary,
    attach,
    results,
    discoverySummary,
    discountPct,
    subtotal,
    marginPct: margin,
    aovLift: attachLine,
    explanations,
    policies: policiesOut,
    blockedReason: null,
  };
}
