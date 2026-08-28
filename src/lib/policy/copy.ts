import type { MerchantPolicies } from "@/lib/agent/types";
import { formatInr } from "@/lib/format";

export type PolicyCopyItem = {
  id: string;
  title: string;
  rule: string;
  why: string;
};

/**
 * Merchant-agnostic policy explanations derived from live guardrail values.
 */
export function buildPolicyCopy(policies: MerchantPolicies): PolicyCopyItem[] {
  const items: PolicyCopyItem[] = [
    {
      id: "discount",
      title: "Discount ceiling",
      rule: `Agent cannot offer more than ${policies.maxDiscountPct}% off list.`,
      why: "Protects advertised pricing and keeps offers above your margin floor.",
    },
    {
      id: "margin",
      title: "Margin floor",
      rule: `Basket margin must stay at or above ${policies.minMarginPct}%.`,
      why: "Stops unprofitable bundles even when the customer is in budget.",
    },
  ];

  if (policies.requireBudgetFit) {
    items.push({
      id: "budget",
      title: "Budget fit",
      rule: "Recommendations must stay inside a stated budget.",
      why: "The agent cannot upsell past the number the buyer named.",
    });
  }

  if (policies.allowCrossSell) {
    items.push({
      id: "attach",
      title: "Attach only with evidence",
      rule: `Cross-sell is allowed only when attach rate is at least ${policies.minAttachRatePct}% and the total still fits.`,
      why: "Keeps add-on offers tied to observed attach, not guesswork.",
    });
  }

  items.push({
    id: "order-cap",
    title: "Order cap",
    rule: `No single order above ${formatInr(policies.maxOrderInr)} without a merchant override.`,
    why: "Limits exposure on unattended checkout flows.",
  });

  return items;
}
