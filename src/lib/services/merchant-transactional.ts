import { db } from "@/lib/db";

/**
 * Removes all buyer/commerce runtime data for a merchant while preserving
 * merchant configuration (catalog, policy). Used by seed and validation tests
 * so admin metrics reflect only real application events.
 */
export async function clearMerchantTransactionalData(merchantId: string): Promise<void> {
  await db.payment.deleteMany({
    where: { order: { session: { merchantId } } },
  });
  await db.order.deleteMany({
    where: { session: { merchantId } },
  });
  await db.agentDecision.deleteMany({
    where: { session: { merchantId } },
  });
  await db.buyerIntent.deleteMany({
    where: { session: { merchantId } },
  });
  await db.auditEvent.deleteMany({
    where: {
      OR: [{ session: { merchantId } }, { merchantId }],
    },
  });
  await db.emailVerificationChallenge.deleteMany({
    where: { identity: { merchantId } },
  });
  await db.buyerIdentity.deleteMany({
    where: { merchantId },
  });
  await db.buyerSession.deleteMany({
    where: { merchantId },
  });
  await db.processedWebhook.deleteMany();
}
