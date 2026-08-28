type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const tones: Record<Tone, string> = {
  neutral: "text-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  accent: "text-accent",
};

export function StatusChip({
  label,
  tone = "neutral",
  live = false,
}: {
  label: string;
  tone?: Tone;
  live?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm ${tones[tone]}`}>
      <span
        className={`size-1.5 rounded-full ${live ? "animate-pulse" : ""} bg-current`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
