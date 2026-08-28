import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireMerchantSession } from "@/lib/auth/request";
import { getActiveCatalog } from "@/lib/services/catalog";
import { toPublicProduct } from "@/lib/services/catalog-map";
import { resolveDemoMerchant } from "@/lib/services/merchant";

export async function GET(request: Request) {
  try {
    await requireMerchantSession(request);
    const merchant = await resolveDemoMerchant();
    const catalog = await getActiveCatalog(merchant.id);
    return NextResponse.json({ catalog: catalog.map(toPublicProduct) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/catalog failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load catalog" },
      { status: 500 },
    );
  }
}
