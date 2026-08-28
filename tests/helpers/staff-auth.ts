import { registerAndVerifyAccount, TEST_PASSWORD, combinedAuthHeaders } from "./accounts";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { createBuyerSession } from "@/lib/services/sessions";
import { seedStaffAllowlist } from "./identity";

const STAFF_EMAIL = "staff@northlineaudio.com";

export async function createStaffAuthContext(rawRequest = "ANC headphones under ₹8,500") {
  const merchantId = getConfiguredDemoMerchantId();
  await seedStaffAllowlist(merchantId, [STAFF_EMAIL, "ops@northlineaudio.com"]);
  const { sessionId } = await createBuyerSession(rawRequest, merchantId);
  const { authSessionId } = await registerAndVerifyAccount({
    email: STAFF_EMAIL,
    password: TEST_PASSWORD,
    merchantId,
    sessionId,
  });
  return {
    sessionId,
    merchantId,
    headers: combinedAuthHeaders(sessionId, authSessionId),
  };
}

export async function createVerifiedBuyerAuthContext(
  rawRequest = "ANC headphones under ₹8,500",
  email = "buyer@example.com",
) {
  const merchantId = getConfiguredDemoMerchantId();
  const { sessionId } = await createBuyerSession(rawRequest, merchantId);
  const { authSessionId } = await registerAndVerifyAccount({
    email,
    password: TEST_PASSWORD,
    merchantId,
    sessionId,
  });
  return {
    sessionId,
    merchantId,
    headers: combinedAuthHeaders(sessionId, authSessionId),
  };
}
