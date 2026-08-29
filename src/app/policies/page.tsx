import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";

export const metadata: Metadata = {
  title: "Policies",
};

export default async function PoliciesPage() {
  const hdrs = await headers();
  const request = new Request("http://internal/policies", {
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });

  try {
    await requireStaffSession(request);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    redirect("/desk");
  }

  redirect("/admin/policies");
}
