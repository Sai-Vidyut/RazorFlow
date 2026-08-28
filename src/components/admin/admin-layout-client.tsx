"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { isStaffOrAdmin } from "@/lib/auth/capability";
import type { BuyerCapability } from "@/lib/auth/capability";

type AdminLayoutClientProps = {
  children: React.ReactNode;
};

export function AdminLayoutClient({ children }: AdminLayoutClientProps) {
  const [merchantName, setMerchantName] = useState("Merchant");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function bootstrap() {
      try {
        const authRes = await fetch("/api/auth/session", { credentials: "include" });
        if (!authRes.ok) {
          throw new Error("Could not load session.");
        }
        const authPayload = (await authRes.json()) as {
          merchantName?: string;
          capability?: BuyerCapability;
        };
        if (!authPayload.capability || !isStaffOrAdmin(authPayload.capability)) {
          throw new Error("Staff access required. Verify an authorized staff email on the desk first.");
        }
        if (authPayload.merchantName) {
          setMerchantName(authPayload.merchantName);
        }
        setReady(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Admin portal unavailable.");
      }
    }

    void bootstrap();
  }, []);

  if (error) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
        <h1 className="text-2xl font-semibold tracking-tight">Admin unavailable</h1>
        <p className="mt-2 text-sm text-muted">{error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
        <p className="text-sm text-muted">Loading merchant control plane…</p>
      </div>
    );
  }

  return <AdminShell merchantName={merchantName}>{children}</AdminShell>;
}
