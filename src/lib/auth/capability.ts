import { isStaffEmail, normalizeEmail } from "@/lib/services/buyer-identity";

export type BuyerCapability = "anonymous" | "buyer" | "staff" | "admin";

export function getInitialAdminEmail(): string | null {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim();
  return email ? normalizeEmail(email) : null;
}

export async function resolveAccountCapability(
  merchantId: string,
  account: { emailNormalized: string; emailVerifiedAt: Date | null },
): Promise<BuyerCapability> {
  if (!account.emailVerifiedAt) return "anonymous";

  const adminEmail = getInitialAdminEmail();
  if (adminEmail && account.emailNormalized === adminEmail) {
    return "admin";
  }

  const staff = await isStaffEmail(merchantId, account.emailNormalized);
  return staff ? "staff" : "buyer";
}

export function isStaffOrAdmin(capability: BuyerCapability): boolean {
  return capability === "staff" || capability === "admin";
}

export function isAdminCapability(capability: BuyerCapability): boolean {
  return capability === "admin";
}

export function capabilityLabel(capability: BuyerCapability): string {
  switch (capability) {
    case "admin":
      return "Administrator";
    case "staff":
      return "Staff";
    case "buyer":
      return "Buyer";
    default:
      return "Guest";
  }
}
