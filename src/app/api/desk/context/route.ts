import { NextResponse } from "next/server";
import { getSessionAuthState } from "@/lib/auth/request";
import { getDeskContext } from "@/lib/services/desk-context";

export async function GET(request: Request) {
  try {
    const { sessionId, identity } = await getSessionAuthState(request);
    const context = await getDeskContext({
      sessionId,
      email: identity?.email ?? null,
      emailVerified: identity?.emailVerified ?? false,
      capability: identity?.capability ?? "anonymous",
    });
    return NextResponse.json(context);
  } catch (error) {
    console.error("GET /api/desk/context failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load desk context" },
      { status: 500 },
    );
  }
}
