"use client";

import type { ReactNode } from "react";
import { AppTopBar } from "@/components/shell/app-top-bar";

type DeskShellProps = {
  merchantName: string;
  sessionLabel?: string | null;
  sessionId?: string | null;
  children: ReactNode;
};

export function DeskShell({
  merchantName,
  sessionLabel,
  sessionId = null,
  children,
}: DeskShellProps) {
  return (
    <div className="min-h-dvh bg-canvas rf-grid-field">
      <AppTopBar
        variant="desk"
        merchantName={merchantName}
        sessionLabel={sessionLabel ? `Session ${sessionLabel}` : null}
        sessionId={sessionId}
      />
      <main id="content" className="rf-page-content px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6">
        {children}
      </main>
    </div>
  );
}
