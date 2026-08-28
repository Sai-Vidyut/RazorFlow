import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { VerificationRequiredError } from "@/lib/auth/identity-errors";
import { requireVerifiedBuyerSession } from "@/lib/auth/request";
import {
  CheckoutError,
  createCheckoutForSession,
  createCheckoutFromCart,
} from "@/lib/services/checkout";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      decisionId?: string;
      source?: "cart" | "decision";
    };
    const sessionId = body.sessionId?.trim();
    const decisionId = body.decisionId?.trim();
    const source = body.source ?? (decisionId ? "decision" : "cart");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    if (source !== "cart" && !decisionId) {
      return NextResponse.json({ error: "decisionId is required for decision checkout" }, { status: 400 });
    }

    await requireVerifiedBuyerSession(request, sessionId);

    const checkout =
      source === "cart"
        ? await createCheckoutFromCart(sessionId)
        : await createCheckoutForSession(sessionId, decisionId!);

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
