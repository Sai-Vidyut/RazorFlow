import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import {
  AdminProductError,
  createAdminProduct,
  listAdminProductCategories,
  listAdminProducts,
  validateCreateAdminProductInput,
} from "@/lib/services/admin-products";

export async function GET(request: Request) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    const statusParam = url.searchParams.get("status");
    const category = url.searchParams.get("category") ?? undefined;

    const status =
      statusParam === "active" || statusParam === "inactive" || statusParam === "all"
        ? statusParam
        : "all";

    const [products, categories] = await Promise.all([
      listAdminProducts(merchantId, { search, status, category }),
      listAdminProductCategories(merchantId),
    ]);

    return NextResponse.json({ products, categories });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/products failed:", error);
    return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const body = await request.json();
    const input = validateCreateAdminProductInput(body);
    const product = await createAdminProduct(merchantId, input);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AdminProductError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/admin/products failed:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
