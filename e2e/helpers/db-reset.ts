import { PrismaClient } from "@prisma/client";
import { updatePersistedPolicies } from "@/lib/services/policies";
import { SEED_POLICIES } from "./baseline";

let prisma: PrismaClient | null = null;

export async function resetPoliciesToSeed() {
  if (!prisma) {
    prisma = new PrismaClient();
    await prisma.$connect();
  }

  await updatePersistedPolicies({
    discountCeilingPct: SEED_POLICIES.maxDiscountPct,
    marginFloorPct: SEED_POLICIES.minMarginPct,
    orderCapPaise: SEED_POLICIES.maxOrderInr * 100,
    minAttachRatePct: SEED_POLICIES.minAttachRatePct,
    allowEvidenceCrossSell: SEED_POLICIES.allowCrossSell,
    requireBudgetFit: SEED_POLICIES.requireBudgetFit,
  });
}
