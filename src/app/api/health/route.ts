import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const merchantCount = await db.merchant.count();
    return NextResponse.json({
      ok: true,
      database: "connected",
      merchantCount,
      seeded: merchantCount > 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database check failed";
    return NextResponse.json({ ok: false, database: "error", message }, { status: 503 });
  }
}
