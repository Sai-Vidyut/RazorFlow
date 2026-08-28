import type { Policy } from "@prisma/client";
import type { MerchantPolicies } from "@/lib/agent/types";

export function policyToMerchantPolicies(policy: Policy, merchantName: string): MerchantPolicies {
  return {
    merchant: merchantName,
    maxDiscountPct: policy.discountCeilingPct,
    minMarginPct: policy.marginFloorPct,
    maxOrderInr: Math.round(policy.orderCapPaise / 100),
    minAttachRatePct: policy.minAttachRatePct,
    allowCrossSell: policy.allowEvidenceCrossSell,
    requireBudgetFit: policy.requireBudgetFit,
  };
}

export type PolicyInput = {
  discountCeilingPct: number;
  marginFloorPct: number;
  orderCapPaise: number;
  minAttachRatePct: number;
  allowEvidenceCrossSell: boolean;
  requireBudgetFit: boolean;
};

export type PolicyResponse = PolicyInput & {
  merchant: string;
};

export function policyToResponse(policy: Policy, merchantName: string): PolicyResponse {
  return {
    merchant: merchantName,
    discountCeilingPct: policy.discountCeilingPct,
    marginFloorPct: policy.marginFloorPct,
    orderCapPaise: policy.orderCapPaise,
    minAttachRatePct: policy.minAttachRatePct,
    allowEvidenceCrossSell: policy.allowEvidenceCrossSell,
    requireBudgetFit: policy.requireBudgetFit,
  };
}

// UI-friendly field names for policies form
export type PoliciesFormValues = {
  merchant: string;
  maxDiscountPct: number;
  minMarginPct: number;
  maxOrderInr: number;
  minAttachRatePct: number;
  allowCrossSell: boolean;
  requireBudgetFit: boolean;
};

export function responseToFormValues(response: PolicyResponse): PoliciesFormValues {
  return {
    merchant: response.merchant,
    maxDiscountPct: response.discountCeilingPct,
    minMarginPct: response.marginFloorPct,
    maxOrderInr: Math.round(response.orderCapPaise / 100),
    minAttachRatePct: response.minAttachRatePct,
    allowCrossSell: response.allowEvidenceCrossSell,
    requireBudgetFit: response.requireBudgetFit,
  };
}

export function formValuesToInput(values: PoliciesFormValues): PolicyInput {
  return {
    discountCeilingPct: values.maxDiscountPct,
    marginFloorPct: values.minMarginPct,
    orderCapPaise: values.maxOrderInr * 100,
    minAttachRatePct: values.minAttachRatePct,
    allowEvidenceCrossSell: values.allowCrossSell,
    requireBudgetFit: values.requireBudgetFit,
  };
}
