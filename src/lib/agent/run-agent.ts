import { discoverProductsWithMeta, isMultiProductDiscovery } from "./discover-catalog";
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

function emptyResult(intent: StructuredIntent, maxBudgetInr: number | null): AgentResult {
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
        reason: "Nothing in the merchant catalog fits the stated constraints.",
        evidence: maxBudgetInr != null ? `Budget ₹${maxBudgetInr}` : "No matching products",
      },
    ],
    policies: [],
    blockedReason: null,
  };
}

export function runAgentWithParsed(
  intent: StructuredIntent,
  policies: MerchantPolicies,
  catalog: Product[],
): AgentResult {
  const quantity = intent.quantity;
  const maxBudgetInr = intentMaxBudgetInr(intent);
  const discountAsk = intent.constraints.maxDiscountPct;
  const explanations: AgentExplanation[] = [];
  const policiesOut: AgentResult["policies"] = [];

  const discovery = discoverProductsWithMeta(intent, catalog);
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
    return emptyResult(intent, maxBudgetInr);
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
