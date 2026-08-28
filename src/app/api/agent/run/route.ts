import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireBuyerSession } from "@/lib/auth/request";
import { agentResultToApiResponse, runAgentForSession } from "@/lib/services/agent-run";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string };
    const sessionId = body.sessionId?.trim();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    await requireBuyerSession(request, sessionId);

    const { sessionId: id, decisionId, result } = await runAgentForSession(sessionId);
    return NextResponse.json(agentResultToApiResponse(id, decisionId, result));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/agent/run failed:", error);
    const message = error instanceof Error ? error.message : "Failed to run agent";
    const status = message === "Session not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
