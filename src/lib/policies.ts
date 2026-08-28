export type { MerchantPolicies } from "@/lib/agent/types";
export { buildPolicyCopy, type PolicyCopyItem } from "@/lib/policy/copy";

// Default policies live in PostgreSQL. Load via GET /api/policies.
