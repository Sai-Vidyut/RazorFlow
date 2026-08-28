/**
 * Demo merchant context for Phase 3A.
 * Multi-tenant auth is out of scope; merchant id is resolved from config, not hardcoded in business logic.
 */
export function getConfiguredDemoMerchantId(): string {
  return process.env.DEMO_MERCHANT_ID?.trim() || "northline-audio";
}
