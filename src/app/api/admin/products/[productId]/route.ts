import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import {
  AdminProductError,
  getAdminProduct,
  updateAdminProduct,
  validateUpdateAdminProductInput,
} from "@/lib/services/admin-products";

type RouteContext = {
  params: Promise<{ productId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const { productId } = await context.params;
    if (!productId?.trim()) {
      return NextResponse.json({ error: "Product id is required" }, { status: 400 });
    }

    const product = await getAdminProduct(merchantId, productId);
    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AdminProductError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/products/[productId] failed:", error);
    return NextResponse.json({ error: "Failed to load product" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const { productId } = await context.params;
    if (!productId?.trim()) {
      return NextResponse.json({ error: "Product id is required" }, { status: 400 });
    }

    const body = await request.json();
    const input = validateUpdateAdminProductInput(body);
    const product = await updateAdminProduct(merchantId, productId, input);
    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AdminProductError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("PATCH /api/admin/products/[productId] failed:", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}
