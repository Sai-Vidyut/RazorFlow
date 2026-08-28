import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import { getAdminInsights } from "@/lib/services/admin-insights";

export async function GET(request: Request) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const insights = await getAdminInsights(merchantId);
    return NextResponse.json(insights);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/insights failed:", error);
    return NextResponse.json({ error: "Failed to load insights" }, { status: 500 });
  }
}
