import { recordMerchantAuditEvent } from "@/lib/audit";
import type { PolicyInput } from "@/lib/policy/map";
import {
  formValuesToInput,
  responseToFormValues,
  type PoliciesFormValues,
} from "@/lib/policy/map";
import { getPersistedPolicies, updatePersistedPolicies } from "@/lib/services/policies";

export class AdminPolicyError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "AdminPolicyError";
  }
}

export function validateAdminPolicyInput(body: unknown): PoliciesFormValues {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AdminPolicyError("Invalid policy payload");
  }

  const record = body as Record<string, unknown>;

  if (
    typeof record.maxDiscountPct !== "number" ||
    typeof record.minMarginPct !== "number" ||
    typeof record.maxOrderInr !== "number" ||
    typeof record.minAttachRatePct !== "number" ||
    typeof record.allowCrossSell !== "boolean" ||
    typeof record.requireBudgetFit !== "boolean"
  ) {
    throw new AdminPolicyError("All policy fields are required with valid types");
  }

  if (record.maxDiscountPct < 0 || record.maxDiscountPct > 100) {
    throw new AdminPolicyError("Discount ceiling must be between 0 and 100");
  }
  if (record.minMarginPct < 0 || record.minMarginPct > 100) {
    throw new AdminPolicyError("Margin floor must be between 0 and 100");
  }
  if (record.maxOrderInr <= 0) {
    throw new AdminPolicyError("Maximum order value must be greater than zero");
  }
  if (record.minAttachRatePct < 0 || record.minAttachRatePct > 100) {
    throw new AdminPolicyError("Attach rate threshold must be between 0 and 100");
  }

  return {
    merchant: typeof record.merchant === "string" ? record.merchant : "",
    maxDiscountPct: record.maxDiscountPct,
    minMarginPct: record.minMarginPct,
    maxOrderInr: record.maxOrderInr,
    minAttachRatePct: record.minAttachRatePct,
    allowCrossSell: record.allowCrossSell,
    requireBudgetFit: record.requireBudgetFit,
  };
}

export async function getAdminPolicies(merchantId: string): Promise<PoliciesFormValues> {
  const policies = await getPersistedPolicies(merchantId);
  return responseToFormValues(policies);
}

export async function updateAdminPolicies(
  merchantId: string,
  input: PoliciesFormValues,
): Promise<PoliciesFormValues> {
  const previous = await getPersistedPolicies(merchantId);
  const policyInput: PolicyInput = formValuesToInput(input);
  const updated = await updatePersistedPolicies(policyInput, merchantId);

  await recordMerchantAuditEvent(merchantId, "POLICY_UPDATED", "merchant", {
    previous: {
      discountCeilingPct: previous.discountCeilingPct,
      marginFloorPct: previous.marginFloorPct,
      orderCapPaise: previous.orderCapPaise,
      minAttachRatePct: previous.minAttachRatePct,
      allowEvidenceCrossSell: previous.allowEvidenceCrossSell,
      requireBudgetFit: previous.requireBudgetFit,
    },
    next: {
      discountCeilingPct: updated.discountCeilingPct,
      marginFloorPct: updated.marginFloorPct,
      orderCapPaise: updated.orderCapPaise,
      minAttachRatePct: updated.minAttachRatePct,
      allowEvidenceCrossSell: updated.allowEvidenceCrossSell,
      requireBudgetFit: updated.requireBudgetFit,
    },
  });

  return responseToFormValues(updated);
}
