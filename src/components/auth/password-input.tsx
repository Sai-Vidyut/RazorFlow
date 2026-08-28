"use client";

import { useId, useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { Input } from "@/components/ui/design-system";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  "data-testid"?: string;
};

export function PasswordInput({
  className = "",
  id,
  "data-testid": dataTestId,
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        id={inputId}
        type={visible ? "text" : "password"}
        className={`pr-10 ${className}`.trim()}
        data-testid={dataTestId}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-r-[8px] px-3 text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={inputId}
        aria-pressed={visible}
        data-testid={dataTestId ? `${dataTestId}-toggle` : undefined}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <EyeSlash className="size-4" weight="regular" aria-hidden />
        ) : (
          <Eye className="size-4" weight="regular" aria-hidden />
        )}
      </button>
    </div>
  );
}
