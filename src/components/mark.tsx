export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 7h10.5L19 12.5 14.5 18H4l4.5-5.5L4 7Z"
        fill="currentColor"
      />
    </svg>
  );
}
