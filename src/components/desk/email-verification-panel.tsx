"use client";

import { FormEvent } from "react";
import { Button, Input } from "@/components/ui/design-system";

type EmailVerificationPanelProps = {
  phase: "request" | "verify" | "verified";
  email: string;
  verificationCode: string;
  sessionId: string | null;
  error: string | null;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onVerificationCodeChange: (value: string) => void;
  onRequest: () => void;
  onVerify: () => void;
  onDismissVerified?: () => void;
};

export function EmailVerificationPanel({
  phase,
  email,
  verificationCode,
  sessionId,
  error,
  busy,
  onEmailChange,
  onVerificationCodeChange,
  onRequest,
  onVerify,
  onDismissVerified,
}: EmailVerificationPanelProps) {
  function handleVerifySubmit(event: FormEvent) {
    event.preventDefault();
    onVerify();
  }

  if (phase === "verified") {
    return (
      <div className="rf-desk-verify rf-enter-fade rounded-[12px] border border-line bg-surface p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <span aria-hidden>✓</span>
          Email verified
        </p>
        <p className="mt-2 text-sm text-muted">You can continue with checkout authorization.</p>
        {onDismissVerified ? (
          <Button type="button" className="mt-4 w-full" onClick={onDismissVerified}>
            Continue
          </Button>
        ) : null}
      </div>
    );
  }

  if (phase === "verify") {
    return (
      <div className="rf-desk-verify rounded-[12px] border border-line bg-surface p-5">
        <h3 className="text-base font-semibold tracking-tight">Check your email</h3>
        <p className="mt-2 text-sm text-ink-soft">
          We sent a verification code to <span className="font-medium text-ink">{email}</span>
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleVerifySubmit}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">Verification code</span>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={verificationCode}
              onChange={(event) => onVerificationCodeChange(event.target.value)}
              disabled={busy || !sessionId}
            />
          </label>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            className="w-full"
            loading={busy}
            disabled={!sessionId || verificationCode.trim().length < 6}
          >
            Verify email
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="rf-desk-verify rounded-[12px] border border-line bg-surface p-5">
      <h3 className="text-base font-semibold tracking-tight">Verify your email</h3>
      <p className="mt-2 text-sm text-ink-soft">
        Verify your email before completing this purchase.
      </p>
      <div className="mt-4 space-y-3">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Email address</span>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            disabled={busy || !sessionId}
          />
        </label>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          className="w-full"
          loading={busy}
          disabled={!sessionId || email.trim().length < 5}
          onClick={onRequest}
        >
          Send verification code
        </Button>
      </div>
    </div>
  );
}
