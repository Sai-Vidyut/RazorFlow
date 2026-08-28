import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import { getAdminOverview } from "@/lib/services/admin-dashboard";

export async function GET(request: Request) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const overview = await getAdminOverview(merchantId);
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/overview failed:", error);
    return NextResponse.json({ error: "Failed to load admin overview" }, { status: 500 });
  }
}
