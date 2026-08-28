import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import {
  listAdminActivity,
  parseActivityFilter,
  parseActivityLimit,
  parseActivityOffset,
} from "@/lib/services/admin-activity";

export async function GET(request: Request) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const url = new URL(request.url);
    const filter = parseActivityFilter(url.searchParams.get("filter"));
    const limit = parseActivityLimit(url.searchParams.get("limit"));
    const offset = parseActivityOffset(url.searchParams.get("offset"));

    const page = await listAdminActivity(merchantId, { filter, limit, offset });
    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/activity failed:", error);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
