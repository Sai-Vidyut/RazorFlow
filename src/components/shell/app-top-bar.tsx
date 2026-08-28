"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Gauge, ShieldCheck, Storefront } from "@phosphor-icons/react";
import { AccountTopBarActions } from "@/components/auth/account-top-bar-actions";
import { CartNavLink } from "@/components/cart/cart-nav-link";
import { Mark } from "@/components/mark";
import { PUBLIC_NAV } from "@/components/shell/nav-config";
import { useScrollCollapse } from "@/components/shell/use-scroll-collapse";

type AppTopBarProps = {
  variant: "public" | "desk" | "admin";
  merchantName?: string;
  sessionLabel?: string | null;
  pageTitle?: string;
  secondary?: ReactNode;
  sessionId?: string | null;
};

function isPublicNavActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppTopBar({
  variant,
  merchantName,
  sessionLabel,
  pageTitle,
  secondary,
  sessionId = null,
}: AppTopBarProps) {
  const collapsed = useScrollCollapse(variant === "public");
  const pathname = usePathname();

  return (
    <header className="rf-app-topbar" data-collapsed={collapsed ? "true" : "false"}>
      <div className="rf-app-topbar-shell">
        <div className="rf-app-topbar-primary">
          <div className="mx-auto flex h-full max-w-[96rem] items-center justify-between gap-4 px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" className="flex shrink-0 items-center gap-2 text-ink">
                <Mark className="size-5 text-accent" />
                <span className="text-sm font-semibold tracking-tight" translate="no">
                  RazorFlow
                </span>
              </Link>

              {variant === "public" ? null : (
                <>
                  <span className="hidden text-line sm:inline" aria-hidden>
                    /
                  </span>
                  <div className="min-w-0 rf-topbar-context">
                    <p className="truncate text-sm font-medium tracking-tight">
                      {variant === "desk" ? "Commerce desk" : (pageTitle ?? "Admin")}
                    </p>
                    {merchantName ? (
                      <p className="truncate text-xs text-muted" translate="no">
                        {merchantName}
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            {variant === "public" ? (
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
                <nav aria-label="Primary" className="hidden min-w-0 items-center gap-0.5 sm:flex sm:gap-1">
                  {PUBLIC_NAV.filter((link) => link.href !== "/admin").map((link) => {
                    const active = isPublicNavActive(pathname, link.href, link.exact);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        className="rf-nav-item rf-motion-colors rounded-[6px] px-2.5 py-1.5 text-sm text-ink-soft hover:text-ink sm:px-3"
                        data-active={active ? "true" : "false"}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </nav>
                <AccountTopBarActions sessionId={sessionId} />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CartNavLink sessionId={sessionId} />
                <AccountTopBarActions sessionId={sessionId} />
                {variant === "desk" ? (
                  <Link
                    href="/policies"
                    className="rf-workspace-switch rf-motion-colors inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-line/70 bg-surface px-3 text-sm text-ink-soft hover:text-ink"
                  >
                    <ShieldCheck className="size-4" aria-hidden />
                    <span className="hidden sm:inline">Policies</span>
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/admin/policies"
                      className="rf-workspace-switch rf-motion-colors inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-line/70 bg-surface px-3 text-sm text-ink-soft hover:text-ink lg:hidden"
                    >
                      <ShieldCheck className="size-4" aria-hidden />
                      <span className="hidden sm:inline">Policies</span>
                    </Link>
                    <Link
                      href="/desk"
                      className="rf-workspace-switch rf-motion-colors inline-flex min-h-9 items-center gap-1.5 rounded-[8px] bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
                    >
                      <Storefront className="size-4" aria-hidden />
                      <span className="hidden sm:inline">Open desk</span>
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {secondary ? <div className="rf-app-topbar-secondary">{secondary}</div> : null}
    </header>
  );
}
