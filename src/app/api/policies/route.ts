import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import { buildPolicyCopy } from "@/lib/policy/copy";
import { formValuesToInput, responseToFormValues } from "@/lib/policy/map";
import { getPersistedPolicies, updatePersistedPolicies } from "@/lib/services/policies";
import { resolveDemoMerchant } from "@/lib/services/merchant";

function withPolicyExplanations(values: ReturnType<typeof responseToFormValues>) {
  return {
    ...values,
    explanations: buildPolicyCopy(values),
  };
}

export async function GET(request: Request) {
  try {
    await requireStaffSession(request);

    const policies = await getPersistedPolicies();
    return NextResponse.json(withPolicyExplanations(responseToFormValues(policies)));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/policies failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load policies" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireStaffSession(request);

    const body = (await request.json()) as {
      maxDiscountPct?: number;
      minMarginPct?: number;
      maxOrderInr?: number;
      minAttachRatePct?: number;
      allowCrossSell?: boolean;
      requireBudgetFit?: boolean;
    };

    if (
      body.maxDiscountPct == null ||
      body.minMarginPct == null ||
      body.maxOrderInr == null ||
      body.allowCrossSell == null ||
      body.requireBudgetFit == null
    ) {
      return NextResponse.json({ error: "All policy fields are required" }, { status: 400 });
    }

    const merchant = await resolveDemoMerchant();
    const current = await getPersistedPolicies(merchant.id);
    const input = formValuesToInput({
      merchant: merchant.name,
      maxDiscountPct: body.maxDiscountPct,
      minMarginPct: body.minMarginPct,
      maxOrderInr: body.maxOrderInr,
      minAttachRatePct: body.minAttachRatePct ?? current.minAttachRatePct,
      allowCrossSell: body.allowCrossSell,
      requireBudgetFit: body.requireBudgetFit,
    });

    const updated = await updatePersistedPolicies(input);
    return NextResponse.json(withPolicyExplanations(responseToFormValues(updated)));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("PUT /api/policies failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update policies" },
      { status: 500 },
    );
  }
}
