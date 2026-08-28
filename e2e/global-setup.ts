import { PrismaClient } from "@prisma/client";
import { updatePersistedPolicies } from "@/lib/services/policies";
import { SEED_POLICIES } from "./helpers/baseline";

export default async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await updatePersistedPolicies({
      discountCeilingPct: SEED_POLICIES.maxDiscountPct,
      marginFloorPct: SEED_POLICIES.minMarginPct,
      orderCapPaise: SEED_POLICIES.maxOrderInr * 100,
      minAttachRatePct: SEED_POLICIES.minAttachRatePct,
      allowEvidenceCrossSell: SEED_POLICIES.allowCrossSell,
      requireBudgetFit: SEED_POLICIES.requireBudgetFit,
    });
  } finally {
    await prisma.$disconnect();
  }
}
