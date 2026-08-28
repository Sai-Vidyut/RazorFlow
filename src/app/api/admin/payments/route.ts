import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import { listAdminPayments, type AdminPaymentFilter } from "@/lib/services/admin-payments";

function parsePaymentFilter(value: string | null): AdminPaymentFilter {
  if (value === "captured" || value === "failed" || value === "pending") return value;
  return "all";
}

export async function GET(request: Request) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const url = new URL(request.url);
    const filter = parsePaymentFilter(url.searchParams.get("status"));
    const payments = await listAdminPayments(merchantId, filter);
    return NextResponse.json({ payments });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/payments failed:", error);
    return NextResponse.json({ error: "Failed to load payments" }, { status: 500 });
  }
}
