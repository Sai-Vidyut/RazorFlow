"use client";

import { useState } from "react";
import { Gauge, SignIn } from "@phosphor-icons/react";
import Link from "next/link";
import { AccountMenu } from "@/components/auth/account-menu";
import { AccountAuthModal } from "@/components/auth/account-auth-modal";
import { useAuthSession } from "@/components/auth/use-auth-session";
import { isStaffOrAdmin } from "@/lib/auth/capability";

type AccountTopBarActionsProps = {
  sessionId?: string | null;
  className?: string;
};

export function AccountTopBarActions({
  sessionId,
  className = "",
}: AccountTopBarActionsProps) {
  const auth = useAuthSession();
  const [modalOpen, setModalOpen] = useState(false);

  const showAdminLink =
    !auth.loading && auth.authenticated && isStaffOrAdmin(auth.capability);

  function openLogin() {
    setModalOpen(true);
  }

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        {auth.authenticated ? (
          <>
            <AccountMenu onLogout={() => void auth.logout()} />
            {showAdminLink ? (
              <Link
                href="/admin"
                aria-label="Admin"
                className="rf-workspace-switch rf-motion-colors inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-line/70 bg-surface px-3 text-sm text-ink-soft hover:text-ink"
              >
                <Gauge className="size-4" aria-hidden />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            aria-label="Log in"
            className="rf-motion-colors inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-line/70 bg-surface px-3 text-sm text-ink-soft hover:text-ink"
            onClick={openLogin}
          >
            <SignIn className="size-4" aria-hidden />
            <span className="hidden sm:inline">Log in</span>
          </button>
        )}
      </div>

      <AccountAuthModal
        open={modalOpen}
        initialMode="login"
        sessionId={sessionId}
        onClose={() => setModalOpen(false)}
        onAuthStateChange={() => void auth.refresh()}
      />
    </>
  );
}
