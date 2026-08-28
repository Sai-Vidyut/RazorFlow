"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { PasswordInput } from "@/components/auth/password-input";
import { Button, Input } from "@/components/ui/design-system";
import { useBodyScrollLock } from "@/lib/hooks/use-body-scroll-lock";
import {
  mapRegistrationError,
  type RegistrationErrorKind,
} from "@/lib/auth/registration-errors";

export type AccountAuthMode =
  | "login"
  | "register"
  | "verify-code"
  | "verified"
  | "forgot-password"
  | "reset-sent";

type AccountAuthModalProps = {
  open: boolean;
  initialMode?: AccountAuthMode;
  sessionId?: string | null;
  onClose: () => void;
  onAuthenticated?: () => void;
  onAuthStateChange?: () => void;
};

export function AccountAuthModal({
  open,
  initialMode = "login",
  sessionId,
  onClose,
  onAuthenticated,
  onAuthStateChange,
}: AccountAuthModalProps) {
  const reduce = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<AccountAuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationErrorKind, setRegistrationErrorKind] = useState<RegistrationErrorKind | null>(
    null,
  );
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");

  useBodyScrollLock(open);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setRegistrationErrorKind(null);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, [open, mode]);

  function handleBackdropClose() {
    if (busy) return;
    if (mode === "verify-code" && verificationCode.length > 0) return;
    onClose();
  }

  function goToLogin() {
    setMode("login");
    setError(null);
    setRegistrationErrorKind(null);
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setRegistrationErrorKind(null);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          passwordConfirmation,
          sessionId,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        account?: { email: string };
      };
      if (!response.ok) {
        const mapped = mapRegistrationError(response.status, payload);
        setRegistrationErrorKind(mapped.kind);
        setError(mapped.message);
        return;
      }
      setPendingEmail(payload.account?.email ?? email);
      setVerificationCode("");
      setMode("verify-code");
      onAuthStateChange?.();
    } catch {
      setRegistrationErrorKind("server");
      setError("We couldn't create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, sessionId }),
      });
      const payload = (await response.json()) as {
        error?: string;
        account?: { email: string; emailVerified: boolean; capability: string };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not sign in");
      }
      onAuthStateChange?.();
      if (!payload.account?.emailVerified) {
        setPendingEmail(payload.account?.email ?? email);
        setVerificationCode("");
        setMode("verify-code");
        return;
      }
      setMode("verified");
      onAuthenticated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not send reset email");
      }
      setMode("reset-sent");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verificationCode, sessionId }),
      });
      const payload = (await response.json()) as { error?: string; account?: { emailVerified: boolean } };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not verify email");
      }
      onAuthStateChange?.();
      setMode("verified");
      onAuthenticated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify email");
    } finally {
      setBusy(false);
    }
  }

  async function handleResendVerification() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
      });
      const payload = (await response.json()) as { error?: string; email?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not resend verification code");
      }
      setPendingEmail(payload.email ?? pendingEmail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend verification code");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="rf-auth-overlay fixed inset-0 z-50 sm:justify-center sm:p-4"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          aria-modal="true"
          role="dialog"
          aria-labelledby="account-auth-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            aria-label="Close"
            onClick={handleBackdropClose}
          />
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            className="rf-auth-modal rf-glass relative z-10 w-full max-w-md border border-line/70 p-0 shadow-xl"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="rf-auth-modal-handle" aria-hidden />
            <div className="rf-auth-modal-body px-5 pb-5 pt-2 sm:px-6 sm:pb-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="account-auth-title" className="text-lg font-semibold tracking-tight">
                  {mode === "register"
                    ? "Create account"
                    : mode === "verify-code"
                      ? "Verify your email"
                      : mode === "verified"
                        ? "Email verified"
                        : mode === "forgot-password"
                          ? "Reset password"
                          : mode === "reset-sent"
                            ? "Check your email"
                            : "Log in"}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {mode === "verify-code"
                    ? "We've sent a 6-digit verification code to your email. Enter it below to continue."
                    : mode === "register"
                      ? "Create a persistent buyer account for Northline Audio."
                      : mode === "login"
                        ? "Sign in to authorize checkout."
                        : null}
                </p>
              </div>
              <button
                type="button"
                className="rf-auth-close rounded-[8px] text-muted hover:bg-surface hover:text-ink"
                aria-label="Close dialog"
                onClick={handleBackdropClose}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {error ? (
              registrationErrorKind === "duplicate" ? (
                <div
                  className="mb-3 rounded-[8px] border border-accent/25 bg-[color-mix(in_oklab,var(--rf-accent)_8%,transparent)] p-3"
                  role="alert"
                >
                  <p className="text-sm text-ink">{error}</p>
                  <button
                    type="button"
                    className="rf-motion-colors mt-2 inline-flex min-h-9 items-center rounded-[8px] bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
                    onClick={goToLogin}
                  >
                    Log in instead
                  </button>
                </div>
              ) : (
                <p className="mb-3 text-sm text-danger" role="alert">
                  {error}
                </p>
              )
            ) : null}

            {mode === "login" ? (
              <form className="space-y-3" onSubmit={handleLogin}>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Email</span>
                  <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Password</span>
                  <PasswordInput
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="auth-login-password"
                  />
                </label>
                <Button type="submit" className="w-full" loading={busy}>
                  Log in
                </Button>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <button type="button" className="text-accent hover:underline" onClick={() => setMode("register")}>
                    Don&apos;t have an account? Create one
                  </button>
                  <button type="button" className="text-muted hover:text-ink" onClick={() => setMode("forgot-password")}>
                    Forgot password?
                  </button>
                </div>
              </form>
            ) : null}

            {mode === "register" ? (
              <form className="space-y-3" onSubmit={handleRegister}>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Email</span>
                  <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Password</span>
                  <PasswordInput
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="auth-register-password"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Confirm password</span>
                  <PasswordInput
                    autoComplete="new-password"
                    value={passwordConfirmation}
                    onChange={(e) => setPasswordConfirmation(e.target.value)}
                    required
                    data-testid="auth-register-password-confirm"
                  />
                </label>
                <Button type="submit" className="w-full" loading={busy}>
                  Create account
                </Button>
                <button
                  type="button"
                  className={`text-sm hover:underline ${
                    registrationErrorKind === "duplicate"
                      ? "font-medium text-accent"
                      : "text-accent"
                  }`}
                  onClick={goToLogin}
                >
                  Already have an account? Log in
                </button>
              </form>
            ) : null}

            {mode === "verify-code" ? (
              <div className="space-y-4">
                <p className="text-sm text-ink-soft">
                  Code sent to{" "}
                  <span className="font-medium text-ink">{pendingEmail ?? email}</span>
                </p>
                <form className="space-y-3" onSubmit={handleVerifyCode}>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">6-digit verification code</span>
                    <Input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="\d{6}"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      data-testid="auth-verification-code"
                      className="text-center text-lg tracking-[0.35em] font-mono"
                    />
                  </label>
                  <Button type="submit" className="w-full" loading={busy}>
                    Verify email
                  </Button>
                </form>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" loading={busy} onClick={() => void handleResendVerification()}>
                    Resend code
                  </Button>
                  <Button type="button" variant="secondary" onClick={onClose}>
                    Cancel
                  </Button>
                </div>
                <button
                  type="button"
                  className="text-sm text-accent hover:underline"
                  onClick={() => {
                    setMode("register");
                    setVerificationCode("");
                    setError(null);
                  }}
                >
                  Wrong email? Change email
                </button>
              </div>
            ) : null}

            {mode === "verified" ? (
              <div className="space-y-4">
                <p className="flex items-center gap-2 text-sm font-medium text-success">
                  <span aria-hidden>✓</span> Email verified
                </p>
                <p className="text-sm text-muted">You can continue with checkout authorization.</p>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    onAuthenticated?.();
                    onClose();
                  }}
                >
                  Continue
                </Button>
              </div>
            ) : null}

            {mode === "forgot-password" ? (
              <form className="space-y-3" onSubmit={handleForgotPassword}>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Email</span>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                <Button type="submit" className="w-full" loading={busy}>
                  Send reset link
                </Button>
                <button type="button" className="text-sm text-accent hover:underline" onClick={() => setMode("login")}>
                  Back to log in
                </button>
              </form>
            ) : null}

            {mode === "reset-sent" ? (
              <div className="space-y-3">
                <p className="text-sm text-ink-soft">
                  If an account exists for that email, a password reset link has been sent.
                </p>
                <Button type="button" className="w-full" onClick={() => setMode("login")}>
                  Back to log in
                </Button>
              </div>
            ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
