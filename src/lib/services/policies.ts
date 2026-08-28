import { db } from "@/lib/db";
import type { PolicyInput } from "@/lib/policy/map";
import {
  policyToMerchantPolicies,
  policyToResponse,
  type PolicyResponse,
} from "@/lib/policy/map";
import { resolveDemoMerchant, resolveMerchantById } from "@/lib/services/merchant";

export async function getPersistedPolicies(merchantId?: string): Promise<PolicyResponse> {
  const merchant = merchantId ? await resolveMerchantById(merchantId) : await resolveDemoMerchant();
  if (!merchant.policy) {
    throw new Error("Merchant policy not found. Run prisma db seed.");
  }
  return policyToResponse(merchant.policy, merchant.name);
}

export async function getMerchantPoliciesForAgent(merchantId: string) {
  const merchant = await resolveMerchantById(merchantId);
  if (!merchant.policy) {
    throw new Error("Merchant policy not found. Run prisma db seed.");
  }
  return policyToMerchantPolicies(merchant.policy, merchant.name);
}

export async function updatePersistedPolicies(input: PolicyInput, merchantId?: string): Promise<PolicyResponse> {
  const merchant = merchantId ? await resolveMerchantById(merchantId) : await resolveDemoMerchant();
  const policy = await db.policy.update({
    where: { merchantId: merchant.id },
    data: {
      discountCeilingPct: input.discountCeilingPct,
      marginFloorPct: input.marginFloorPct,
      orderCapPaise: input.orderCapPaise,
      minAttachRatePct: input.minAttachRatePct,
      allowEvidenceCrossSell: input.allowEvidenceCrossSell,
      requireBudgetFit: input.requireBudgetFit,
    },
  });
  return policyToResponse(policy, merchant.name);
}
