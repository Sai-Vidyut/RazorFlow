import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import {
  AdminPolicyError,
  getAdminPolicies,
  updateAdminPolicies,
  validateAdminPolicyInput,
} from "@/lib/services/admin-policies";

export async function GET(request: Request) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const policies = await getAdminPolicies(merchantId);
    return NextResponse.json({ policies });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/policies failed:", error);
    return NextResponse.json({ error: "Failed to load policies" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const body = await request.json();
    const input = validateAdminPolicyInput(body);
    const policies = await updateAdminPolicies(merchantId, input);
    return NextResponse.json({ policies });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AdminPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("PUT /api/admin/policies failed:", error);
    return NextResponse.json({ error: "Failed to update policies" }, { status: 500 });
  }
}
