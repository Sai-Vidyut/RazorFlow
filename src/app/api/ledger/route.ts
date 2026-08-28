import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireMerchantSession } from "@/lib/auth/request";
import { getLedgerData } from "@/lib/services/ledger";

export async function GET(request: Request) {
  try {
    await requireMerchantSession(request);
    const ledger = await getLedgerData();
    return NextResponse.json(ledger);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/ledger failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load ledger" },
      { status: 500 },
    );
  }
}
