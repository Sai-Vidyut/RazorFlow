import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  className?: string;
  as?: "div" | "aside" | "section";
};

export function LiquidGlass({
  children,
  className = "",
  as: Tag = "div",
  ...rest
}: Props) {
  return (
    <Tag className={`rf-glass ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
