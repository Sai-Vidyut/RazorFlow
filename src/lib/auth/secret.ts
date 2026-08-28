const DEV_FALLBACK_SECRET = "razorflow-dev-session-secret-change-me";

export function getSessionSecret(): string {
  const secret = process.env.RAZORFLOW_SESSION_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("RAZORFLOW_SESSION_SECRET is required in production");
  }
  return DEV_FALLBACK_SECRET;
}
