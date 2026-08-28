import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import { listAdminRecovery, queryRecoveryMetrics, type RecoveryFilter } from "@/lib/services/admin-recovery";

function parseRecoveryFilter(value: string | null): RecoveryFilter {
  if (value === "candidate" || value === "recovered" || value === "in_progress") return value;
  return "all";
}

export async function GET(request: Request) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const url = new URL(request.url);
    const filter = parseRecoveryFilter(url.searchParams.get("status"));
    const [items, metrics] = await Promise.all([
      listAdminRecovery(merchantId, filter),
      queryRecoveryMetrics(merchantId),
    ]);
    return NextResponse.json({ items, metrics });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/recovery failed:", error);
    return NextResponse.json({ error: "Failed to load recovery data" }, { status: 500 });
  }
}
