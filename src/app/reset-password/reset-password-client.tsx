"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/design-system";
import { PasswordInput } from "@/components/auth/password-input";

export default function ResetPasswordClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, passwordConfirmation }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not reset password");
      }
      setMessage(payload.message ?? "Password updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main id="content" className="mx-auto flex min-h-[60dvh] max-w-lg flex-col justify-center px-4 py-12">
        <div className="rf-glass rounded-[16px] border border-line/70 p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Reset password</h1>
          {!token ? (
            <p className="mt-3 text-sm text-danger">Reset link is invalid.</p>
          ) : message ? (
            <>
              <p className="mt-3 text-sm text-success">{message}</p>
              <Link
                href="/desk"
                className="rf-btn rf-btn-primary rf-motion-colors mt-6 inline-flex min-h-11 items-center rounded-[8px] px-5 text-sm font-medium text-white"
              >
                Sign in at the desk
              </Link>
            </>
          ) : (
            <form className="mt-4 space-y-3" onSubmit={onSubmit}>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">New password</span>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="reset-password-new"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Confirm password</span>
                <PasswordInput
                  value={passwordConfirmation}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  required
                  data-testid="reset-password-confirm"
                />
              </label>
              {error ? (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" loading={busy}>
                Update password
              </Button>
            </form>
          )}
        </div>
      </main>
      <SiteFooter merchantName="Northline Audio" />
    </>
  );
}
