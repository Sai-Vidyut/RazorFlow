"use client";

import { useEffect, useRef, useState } from "react";
import { SignOut, UserCircle } from "@phosphor-icons/react";
import { capabilityLabel } from "@/lib/auth/capability";
import type { BuyerCapability } from "@/lib/auth/capability";
import { useAuthSession } from "@/components/auth/use-auth-session";

type AccountMenuProps = {
  onLogout: () => void;
};

export function AccountMenu({ onLogout }: AccountMenuProps) {
  const auth = useAuthSession();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (!auth.authenticated) return null;

  const capability = auth.capability as BuyerCapability;
  const verificationLabel = auth.emailVerified ? "Verified" : "Not verified";

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        className="rf-motion-colors inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-line/70 bg-surface px-3 text-sm text-ink-soft hover:text-ink"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <UserCircle className="size-4" aria-hidden />
        <span className="hidden sm:inline">Account</span>
      </button>
      {open ? (
        <div
          className="rf-glass absolute right-0 z-50 mt-2 w-72 rounded-[12px] border border-line/70 p-4 shadow-xl"
          role="dialog"
          aria-label="Account details"
        >
          <p className="truncate text-sm font-medium text-ink">{auth.email}</p>
          <p className="mt-1 text-xs text-muted">{verificationLabel}</p>
          <p className="mt-0.5 text-xs font-medium text-accent">{capabilityLabel(capability)}</p>
          <button
            type="button"
            className="rf-motion-colors mt-4 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-[8px] border border-line/70 bg-surface px-3 text-sm text-ink-soft hover:text-ink"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <SignOut className="size-4" aria-hidden />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
