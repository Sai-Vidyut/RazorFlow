import type { ReactNode } from "react";

type PublicPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export function PublicPageHeader({ eyebrow, title, description }: PublicPageHeaderProps) {
  return (
    <header className="rf-public-header">
      {eyebrow ? <p className="rf-eyebrow">{eyebrow}</p> : null}
      <h1 className="rf-public-title">{title}</h1>
      {description ? <p className="rf-public-description">{description}</p> : null}
    </header>
  );
}

type PublicSectionProps = {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function PublicSection({ id, title, description, children, className = "" }: PublicSectionProps) {
  return (
    <section className={`rf-public-section ${className}`.trim()} aria-labelledby={id}>
      <h2 id={id} className="rf-section-label">
        {title}
      </h2>
      {description ? <p className="mt-2 max-w-[52ch] text-sm text-ink-soft">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
