import { formatDelta, formatInr } from "@/lib/format";

type Props = {
  value: number;
  delta?: boolean;
  className?: string;
};

export function Money({ value, delta = false, className = "" }: Props) {
  return (
    <span className={`font-mono tabular ${className}`} translate="no">
      {delta ? formatDelta(value) : formatInr(value)}
    </span>
  );
}
