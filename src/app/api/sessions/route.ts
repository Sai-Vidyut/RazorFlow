import { NextResponse } from "next/server";
import { appendBuyerSessionCookie } from "@/lib/auth/buyer-cookies";
import { createBuyerSession } from "@/lib/services/sessions";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rawRequest?: string };
    const rawRequest = body.rawRequest?.trim();
    if (!rawRequest || rawRequest.length < 4) {
      return NextResponse.json({ error: "rawRequest is required" }, { status: 400 });
    }

    const result = await createBuyerSession(rawRequest);
    const response = NextResponse.json(result);
    appendBuyerSessionCookie(response, result.sessionId);
    return response;
  } catch (error) {
    console.error("POST /api/sessions failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create session" },
      { status: 500 },
    );
  }
}
