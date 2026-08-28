import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { VerificationRequiredError } from "@/lib/auth/identity-errors";
import { requireVerifiedBuyerSession } from "@/lib/auth/request";
import { CheckoutError, createCheckoutForSession } from "@/lib/services/checkout";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string; decisionId?: string };
    const sessionId = body.sessionId?.trim();
    const decisionId = body.decisionId?.trim();

    if (!sessionId || !decisionId) {
      return NextResponse.json({ error: "sessionId and decisionId are required" }, { status: 400 });
    }

    await requireVerifiedBuyerSession(request, sessionId);

    const checkout = await createCheckoutForSession(sessionId, decisionId);
    return NextResponse.json(checkout);
  } catch (error) {
    if (error instanceof VerificationRequiredError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/checkout failed:", error);
    return NextResponse.json({ error: "Checkout could not be started" }, { status: 500 });
  }
}
