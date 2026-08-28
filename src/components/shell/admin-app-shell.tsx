"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CaretDoubleLeft, CaretDoubleRight, List, X } from "@phosphor-icons/react";
import { Mark } from "@/components/mark";
import { AppTopBar } from "@/components/shell/app-top-bar";
import { ADMIN_NAV_GROUPS, titleForPath } from "@/components/shell/nav-config";
import { useSidebarCollapse } from "@/components/shell/use-sidebar-collapse";
import { useBodyScrollLock } from "@/lib/hooks/use-body-scroll-lock";

type AdminAppShellProps = {
  merchantName: string;
  children: React.ReactNode;
};

export function AdminAppShell({ merchantName, children }: AdminAppShellProps) {
  const pathname = usePathname();
  const pageTitle = titleForPath(pathname);
  const { collapsed, toggle, ready } = useSidebarCollapse();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const merchantInitial = merchantName.trim().charAt(0).toUpperCase() || "M";

  useBodyScrollLock(mobileNavOpen);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  return (
    <div
      className="rf-app-shell min-h-dvh bg-canvas text-ink"
      data-sidebar-collapsed={collapsed ? "true" : "false"}
      data-sidebar-ready={ready ? "true" : "false"}
    >
      <div className="rf-app-shell-layout lg:flex">
        <aside
          className="rf-sidebar hidden lg:flex lg:min-h-dvh lg:flex-col"
          aria-label="Admin navigation"
        >
          <div className="rf-sidebar-header flex h-[var(--rf-topbar-height-expanded)] shrink-0 items-center border-b border-line">
            <div className="rf-sidebar-brand flex min-w-0 flex-1 items-center gap-3 px-4">
              <Mark className="rf-sidebar-mark size-5 shrink-0 text-accent" />
              <div className="rf-sidebar-brand-text min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight">RazorFlow</p>
                <p className="truncate text-[11px] text-muted" translate="no">
                  Merchant OS
                </p>
              </div>
            </div>
            <button
              type="button"
              className="rf-sidebar-toggle rf-motion-colors mr-2 flex size-11 shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-canvas/60 hover:text-ink"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-controls="admin-sidebar-nav"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <CaretDoubleRight className="size-4" weight="regular" aria-hidden />
              ) : (
                <CaretDoubleLeft className="size-4" weight="regular" aria-hidden />
              )}
            </button>
          </div>

          <nav id="admin-sidebar-nav" aria-label="Admin" className="flex-1 overflow-x-hidden overflow-y-auto px-2.5 py-4">
            {ADMIN_NAV_GROUPS.map((group) => (
              <div key={group.label} className="rf-sidebar-group mb-5 last:mb-0">
                <p className="rf-sidebar-section-label mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className="rf-nav-link rf-motion-colors flex min-h-11 items-center gap-2.5 px-2.5 py-1.5 text-[13px] text-ink-soft hover:bg-canvas/60 hover:text-ink"
                          data-active={active ? "true" : "false"}
                        >
                          <Icon className="rf-nav-link-icon size-4 shrink-0 opacity-80" aria-hidden />
                          <span className="rf-sidebar-label">{item.label}</span>
                          <span className="rf-sidebar-tooltip" role="tooltip">
                            {item.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="rf-sidebar-footer shrink-0 border-t border-line px-4 py-3.5">
            <div
              className="rf-sidebar-merchant-mark flex size-8 items-center justify-center rounded-[8px] border border-line/80 bg-surface text-xs font-semibold text-ink-soft"
              aria-hidden
            >
              {merchantInitial}
            </div>
            <div className="rf-sidebar-footer-text min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
                Merchant
              </p>
              <p className="mt-0.5 truncate text-sm font-medium" translate="no">
                {merchantName}
              </p>
            </div>
          </div>
        </aside>

        <div className="rf-app-shell-main flex min-h-dvh min-w-0 flex-1 flex-col">
          <AppTopBar variant="admin" merchantName={merchantName} pageTitle={pageTitle} />

          <div className="rf-admin-mobile-bar lg:hidden">
            <button
              type="button"
              className="rf-admin-mobile-menu-btn rf-motion-colors"
              aria-expanded={mobileNavOpen}
              aria-controls="admin-mobile-nav-drawer"
              aria-label={mobileNavOpen ? "Close admin menu" : "Open admin menu"}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              {mobileNavOpen ? <X className="size-5" aria-hidden /> : <List className="size-5" aria-hidden />}
            </button>
            <p className="rf-admin-mobile-current truncate">{pageTitle}</p>
          </div>

          {mobileNavOpen ? (
            <>
              <button
                type="button"
                className="rf-admin-nav-drawer-backdrop lg:hidden"
                aria-label="Close admin menu"
                onClick={() => setMobileNavOpen(false)}
              />
              <aside
                id="admin-mobile-nav-drawer"
                className="rf-admin-nav-drawer lg:hidden"
                role="dialog"
                aria-modal="true"
                aria-label="Admin menu"
              >
                <div className="rf-admin-nav-drawer-header">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tracking-tight">RazorFlow Admin</p>
                    <p className="truncate text-xs text-muted" translate="no">
                      {merchantName}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rf-admin-mobile-menu-btn rf-motion-colors"
                    aria-label="Close admin menu"
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </div>
                <nav className="rf-admin-nav-drawer-body" aria-label="Admin mobile navigation">
                  {ADMIN_NAV_GROUPS.map((group) => (
                    <div key={group.label} className="mb-4 last:mb-0">
                      <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                        {group.label}
                      </p>
                      <ul className="space-y-0.5">
                        {group.items.map((item) => {
                          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                          const Icon = item.icon;
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                className="rf-nav-link rf-motion-colors flex min-h-11 items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-sm text-ink-soft hover:bg-canvas/60 hover:text-ink"
                                data-active={active ? "true" : "false"}
                                onClick={() => setMobileNavOpen(false)}
                              >
                                <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
                                {item.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </nav>
              </aside>
            </>
          ) : null}

          <main id="content" className="rf-page-content flex-1 px-4 py-5 md:px-6 md:py-7 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
