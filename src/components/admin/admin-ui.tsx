"use client";

import type { ReactNode } from "react";
import { Money } from "@/components/money";
import { useBodyScrollLock } from "@/lib/hooks/use-body-scroll-lock";
import {
  Badge,
  EmptyState as DsEmptyState,
  FilterSelect as DsFilterSelect,
  LoadingState,
  type BadgeTone,
} from "@/components/ui/design-system";

export {
  PageHeader,
  SectionHeading,
  Surface,
  Button,
  Input,
  Textarea,
  Select,
  Badge,
  LoadingState,
  Skeleton,
  DataTable,
  TableHead,
  TableRow,
  TableCell,
  TableHeaderCell,
  PrimaryMetric,
  MetricGroup,
  HeroMetric,
  StatStrip,
  StatCell,
  EventStream,
  EventRow,
  SearchInput,
  FilterBar,
  FormField,
  Sheet,
  Dialog,
  Timeline,
  TimelineItem,
  Panel,
} from "@/components/ui/design-system";
export type { BadgeTone } from "@/components/ui/design-system";

export function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatTimeShort(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatPct(value: number | null) {
  if (value == null) return "—";
  return `${Math.round(value * 1000) / 10}%`;
}

export function MetricCard({
  label,
  value,
  hint,
  money = false,
  primary = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  money?: boolean;
  primary?: boolean;
}) {
  return (
    <div className={primary ? "rf-primary-metric rounded-[12px] p-4 md:p-5" : "rf-metric"}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1.5 text-ink ${primary ? "rf-metric-value-primary" : "rf-metric-value"}`}>
        {typeof value === "string" ? value : money ? <Money value={value} /> : value}
      </p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <DsEmptyState title={title} description={description} />;
}

export function AdminFeedback({
  message,
  variant = "success",
}: {
  message: string;
  variant?: "success" | "error";
}) {
  const classes =
    variant === "error"
      ? "border border-[color-mix(in_oklab,var(--rf-danger)_24%,transparent)] bg-[color-mix(in_oklab,var(--rf-danger)_10%,transparent)] text-danger"
      : "border border-[color-mix(in_oklab,var(--rf-accent)_24%,transparent)] bg-accent-soft text-ink";
  return (
    <p className={`rf-admin-feedback-enter rounded-[8px] px-4 py-3 text-sm ${classes}`} role={variant === "error" ? "alert" : "status"}>
      {message}
    </p>
  );
}

export function DetailDrawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useBodyScrollLock(true);

  return (
    <div className="rf-overlay !items-stretch !justify-end !p-0" role="presentation" onClick={onClose}>
      <div className="rf-overlay-backdrop" aria-hidden />
      <aside
        aria-labelledby="admin-drawer-title"
        role="dialog"
        aria-modal="true"
        className="rf-sheet relative z-[51] h-dvh w-full max-w-lg overflow-y-auto overscroll-contain"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rf-panel-header sticky top-0 z-10 border-b border-line/60 bg-surface">
          <h2 id="admin-drawer-title" className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rf-motion-colors inline-flex min-h-11 min-w-11 items-center justify-center rounded-[8px] px-3 text-sm text-muted hover:bg-canvas-2 hover:text-ink"
            aria-label="Close drawer"
          >
            Close
          </button>
        </div>
        <div className="rf-panel-body">{children}</div>
      </aside>
    </div>
  );
}

export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return <DsFilterSelect label={label} value={value} options={options} onChange={onChange} />;
}

export function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return <Badge tone={tone}>{label}</Badge>;
}

export function orderStatusTone(status: string): BadgeTone {
  const normalized = status.toLowerCase();
  if (normalized === "paid" || normalized === "completed") return "success";
  if (normalized === "failed") return "danger";
  if (normalized === "pending") return "warning";
  return "neutral";
}

export function paymentStatusTone(status: string): BadgeTone {
  const normalized = status.toLowerCase();
  if (normalized === "captured" || normalized === "paid") return "success";
  if (normalized === "failed") return "danger";
  if (normalized === "pending" || normalized === "created") return "warning";
  return "neutral";
}

export function productCatalogTone(active: boolean, inventory: number): BadgeTone {
  if (!active) return "neutral";
  if (inventory === 0) return "danger";
  return "success";
}

export function productCatalogLabel(active: boolean, inventory: number): string {
  if (!active) return "Inactive";
  if (inventory === 0) return "Out of stock";
  return "Active";
}

export function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rf-detail-section">
      <h3 className="rf-detail-section-title">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function DetailMetrics({ children }: { children: ReactNode }) {
  return <dl className="rf-detail-metrics">{children}</dl>;
}

export function DetailMetric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rf-detail-metric">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

export function DetailField({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rf-detail-field">
      <dt className="rf-detail-label">{label}</dt>
      <dd className={`rf-detail-value ${mono ? "font-mono text-xs" : ""}`}>{children}</dd>
    </div>
  );
}

export function DetailFields({ children }: { children: ReactNode }) {
  return <dl className="rf-detail-fields">{children}</dl>;
}

export function AdminPageLoading({ label }: { label: string }) {
  return <LoadingState label={label} />;
}
