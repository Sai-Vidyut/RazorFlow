import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireBuyerSession } from "@/lib/auth/request";
import { evaluateRecovery } from "@/lib/services/recovery";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string; decisionId?: string };
    const sessionId = body.sessionId?.trim();
    const decisionId = body.decisionId?.trim();

    if (!sessionId || !decisionId) {
      return NextResponse.json({ error: "sessionId and decisionId are required" }, { status: 400 });
    }

    await requireBuyerSession(request, sessionId);

    const evaluation = await evaluateRecovery(sessionId, decisionId, { recordAudit: true });
    return NextResponse.json({ evaluation });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/recovery/evaluate failed:", error);
    return NextResponse.json({ error: "Could not evaluate recovery" }, { status: 500 });
  }
}
