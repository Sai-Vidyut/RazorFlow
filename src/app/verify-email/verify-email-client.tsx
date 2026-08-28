"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Verification link is invalid.");
      return;
    }

    async function verify(verificationToken: string) {
      try {
        const response = await fetch(
          `/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`,
        );
        const payload = (await response.json()) as { error?: string; email?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Verification failed");
        }
        setMessage(`Email verified for ${payload.email ?? "your account"}.`);
        setStatus("success");
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : "Verification failed");
        setStatus("error");
      }
    }

    void verify(token);
  }, [token]);

  return (
    <>
      <SiteHeader />
      <main id="content" className="mx-auto flex min-h-[60dvh] max-w-lg flex-col justify-center px-4 py-12">
        <div className="rf-glass rounded-[16px] border border-line/70 p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Email verification</h1>
          <p
            className={`mt-3 text-sm ${
              status === "success" ? "text-success" : status === "error" ? "text-danger" : "text-muted"
            }`}
          >
            {message}
          </p>
          {status === "success" ? (
            <Link
              href="/desk"
              className="rf-btn rf-btn-primary rf-motion-colors mt-6 inline-flex min-h-11 items-center rounded-[8px] px-5 text-sm font-medium text-white"
            >
              Continue to desk
            </Link>
          ) : null}
        </div>
      </main>
      <SiteFooter merchantName="Northline Audio" />
    </>
  );
}
