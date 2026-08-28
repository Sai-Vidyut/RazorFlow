import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireAdminSession } from "@/lib/auth/request";
import {
  addStaffEmail,
  listStaffMembers,
  removeStaffEmail,
  StaffManagementError,
} from "@/lib/services/staff-management";

export async function GET(request: Request) {
  try {
    const { merchantId } = await requireAdminSession(request);
    const staff = await listStaffMembers(merchantId);
    return NextResponse.json({ staff });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("GET /api/admin/staff failed:", error);
    return NextResponse.json({ error: "Could not load staff" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { merchantId } = await requireAdminSession(request);
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    const member = await addStaffEmail(merchantId, email);
    return NextResponse.json({ member });
  } catch (error) {
    if (error instanceof StaffManagementError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("POST /api/admin/staff failed:", error);
    return NextResponse.json({ error: "Could not add staff email" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { merchantId } = await requireAdminSession(request);
    const body = (await request.json()) as { id?: string };
    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "Staff entry id is required" }, { status: 400 });
    }
    await removeStaffEmail(merchantId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffManagementError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("DELETE /api/admin/staff failed:", error);
    return NextResponse.json({ error: "Could not remove staff email" }, { status: 500 });
  }
}
