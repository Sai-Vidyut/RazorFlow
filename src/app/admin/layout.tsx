import type { ReactNode } from "react";
import { headers } from "next/headers";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";

function staffAccessMessage(error: AuthError): string {
  if (error.code === "ADMIN_REQUIRED") {
    return "Administrator access is required for this section.";
  }
  if (error.code === "STAFF_REQUIRED" || error.code === "STAFF_VERIFICATION_REQUIRED") {
    return "Staff access required. Verify an authorized staff email on the desk first.";
  }
  return error.message;
}

export default async function AdminRouteLayout({ children }: { children: ReactNode }) {
  const hdrs = await headers();
  const request = new Request("http://internal/admin", {
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });

  try {
    await requireStaffSession(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return (
        <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
          <h1 className="text-2xl font-semibold tracking-tight">Admin unavailable</h1>
          <p className="mt-2 text-sm text-muted">{staffAccessMessage(error)}</p>
        </div>
      );
    }
    throw error;
  }

  return children;
}
