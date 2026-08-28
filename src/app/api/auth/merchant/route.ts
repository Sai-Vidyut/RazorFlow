import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import { resolveDemoMerchant } from "@/lib/services/merchant";

export async function POST(request: Request) {
  try {
    const merchant = await resolveDemoMerchant();
    const staff = await requireStaffSession(request);
    if (staff.merchantId !== merchant.id) {
      throw new AuthError("Staff session merchant mismatch", 403);
    }

    return NextResponse.json({
      merchantId: merchant.id,
      merchantName: merchant.name,
      email: staff.email,
      capability: "staff",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("POST /api/auth/merchant failed:", error);
    return NextResponse.json({ error: "Staff session required" }, { status: 500 });
  }
}
