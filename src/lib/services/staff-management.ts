import { AuthError } from "@/lib/auth/errors";
import { normalizeEmail } from "@/lib/services/buyer-identity";
import { db } from "@/lib/db";

export class StaffManagementError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = "StaffManagementError";
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type StaffMemberView = {
  id: string;
  email: string;
  createdAt: string;
  accountVerified: boolean;
  accountEmail: string | null;
};

export async function listStaffMembers(merchantId: string): Promise<StaffMemberView[]> {
  const rows = await db.merchantStaffEmail.findMany({
    where: { merchantId },
    orderBy: { createdAt: "asc" },
  });

  const normalizedEmails = rows.map((row) => normalizeEmail(row.email));
  const accounts = await db.buyerAccount.findMany({
    where: {
      merchantId,
      emailNormalized: { in: normalizedEmails },
    },
    select: { emailNormalized: true, emailVerifiedAt: true, email: true },
  });
  const accountByEmail = new Map(accounts.map((a) => [a.emailNormalized, a]));

  return rows.map((row) => {
    const normalized = normalizeEmail(row.email);
    const account = accountByEmail.get(normalized);
    return {
      id: row.id,
      email: row.email,
      createdAt: row.createdAt.toISOString(),
      accountVerified: account?.emailVerifiedAt != null,
      accountEmail: account?.email ?? null,
    };
  });
}

export async function addStaffEmail(merchantId: string, rawEmail: string): Promise<StaffMemberView> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    throw new StaffManagementError("Enter a valid email address", 400, "INVALID_EMAIL");
  }

  try {
    const row = await db.merchantStaffEmail.create({
      data: { merchantId, email },
    });

    const account = await db.buyerAccount.findUnique({
      where: { merchantId_emailNormalized: { merchantId, emailNormalized: email } },
      select: { email: true, emailVerifiedAt: true },
    });

    if (account?.emailVerifiedAt) {
      await db.buyerIdentity.updateMany({
        where: {
          account: {
            merchantId,
            emailNormalized: email,
          },
        },
        data: { isStaff: true },
      });
    }

    return {
      id: row.id,
      email: row.email,
      createdAt: row.createdAt.toISOString(),
      accountVerified: account?.emailVerifiedAt != null,
      accountEmail: account?.email ?? null,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      throw new StaffManagementError("That email is already on the staff list", 409, "DUPLICATE");
    }
    throw error;
  }
}

export async function removeStaffEmail(merchantId: string, staffEmailId: string): Promise<void> {
  const row = await db.merchantStaffEmail.findUnique({ where: { id: staffEmailId } });
  if (!row || row.merchantId !== merchantId) {
    throw new StaffManagementError("Staff entry not found", 404);
  }

  await db.merchantStaffEmail.delete({ where: { id: staffEmailId } });

  const email = normalizeEmail(row.email);
  await db.buyerIdentity.updateMany({
    where: {
      account: { merchantId, emailNormalized: email },
    },
    data: { isStaff: false },
  });
}

export { AuthError };
