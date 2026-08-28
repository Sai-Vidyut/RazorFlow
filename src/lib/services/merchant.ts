import { db } from "@/lib/db";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";

export async function resolveMerchantById(merchantId: string) {
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    include: { policy: true },
  });
  if (!merchant) {
    throw new Error(`Merchant not found: ${merchantId}`);
  }
  return merchant;
}

export async function resolveDemoMerchant() {
  return resolveMerchantById(getConfiguredDemoMerchantId());
}

/** @deprecated Use resolveDemoMerchant — kept for gradual migration */
export async function getDemoMerchant() {
  return resolveDemoMerchant();
}
