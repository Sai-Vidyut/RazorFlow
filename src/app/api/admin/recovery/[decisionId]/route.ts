import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import { getAdminRecoveryDetail } from "@/lib/services/admin-recovery";

type RouteContext = { params: Promise<{ decisionId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const { decisionId } = await context.params;
    const detail = await getAdminRecoveryDetail(merchantId, decisionId);
    if (!detail) {
      return NextResponse.json({ error: "Recovery record not found" }, { status: 404 });
    }
    return NextResponse.json({ recovery: detail });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/recovery/[decisionId] failed:", error);
    return NextResponse.json({ error: "Failed to load recovery detail" }, { status: 500 });
  }
}
