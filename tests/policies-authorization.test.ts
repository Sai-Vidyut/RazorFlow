import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { GET as getPoliciesRoute, PUT as putPoliciesRoute } from "@/app/api/policies/route";
import { GET as getAdminPoliciesRoute, PUT as putAdminPoliciesRoute } from "@/app/api/admin/policies/route";
import { getPersistedPolicies } from "@/lib/services/policies";
import { responseToFormValues } from "@/lib/policy/map";
import { createStaffAuthContext } from "./helpers/staff-auth";
import { createVerifiedBuyerAuthContext } from "./helpers/staff-auth";
import { unauthorizedHeaders } from "./helpers/auth";

const prisma = new PrismaClient();
let staffHeaders: HeadersInit;
let buyerHeaders: HeadersInit;

describe("policy authorization", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const staff = await createStaffAuthContext();
    staffHeaders = staff.headers;
    const buyer = await createVerifiedBuyerAuthContext("Gift speaker under ₹4,000", "buyer-policy-auth@example.com");
    buyerHeaders = buyer.headers;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects unauthenticated reads on /api/policies", async () => {
    const response = await getPoliciesRoute(
      new Request("http://localhost/api/policies", { headers: unauthorizedHeaders() }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects buyer reads on /api/policies", async () => {
    const response = await getPoliciesRoute(
      new Request("http://localhost/api/policies", { headers: buyerHeaders }),
    );
    expect(response.status).toBe(403);
  });

  it("allows staff reads on /api/policies", async () => {
    const response = await getPoliciesRoute(
      new Request("http://localhost/api/policies", { headers: staffHeaders }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { maxDiscountPct: number };
    expect(payload.maxDiscountPct).toBeGreaterThan(0);
  });

  it("rejects buyer mutations on /api/policies", async () => {
    const current = responseToFormValues(await getPersistedPolicies());
    const response = await putPoliciesRoute(
      new Request("http://localhost/api/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...buyerHeaders },
        body: JSON.stringify(current),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("allows staff mutations on /api/policies", async () => {
    const current = responseToFormValues(await getPersistedPolicies());
    const response = await putPoliciesRoute(
      new Request("http://localhost/api/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...staffHeaders },
        body: JSON.stringify(current),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects buyer mutations on /api/admin/policies", async () => {
    const getResponse = await getAdminPoliciesRoute(
      new Request("http://localhost/api/admin/policies", { headers: staffHeaders }),
    );
    const { policies } = (await getResponse.json()) as {
      policies: Record<string, unknown>;
    };

    const response = await putAdminPoliciesRoute(
      new Request("http://localhost/api/admin/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...buyerHeaders },
        body: JSON.stringify(policies),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("allows staff mutations on /api/admin/policies", async () => {
    const getResponse = await getAdminPoliciesRoute(
      new Request("http://localhost/api/admin/policies", { headers: staffHeaders }),
    );
    const { policies } = (await getResponse.json()) as {
      policies: Record<string, unknown>;
    };

    const response = await putAdminPoliciesRoute(
      new Request("http://localhost/api/admin/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...staffHeaders },
        body: JSON.stringify(policies),
      }),
    );
    expect(response.status).toBe(200);
  });
});
