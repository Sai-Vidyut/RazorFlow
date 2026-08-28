export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export function toEmailDeliveryError(error: unknown): EmailDeliveryError {
  const candidate = error as { code?: string; responseCode?: number };
  const authFailure =
    candidate.code === "EAUTH" ||
    candidate.code === "ESOCKET" ||
    candidate.responseCode === 535;

  if (authFailure) {
    const devHint =
      process.env.NODE_ENV !== "production"
        ? " For Gmail, set SMTP_PASSWORD to a 16-character App Password (Google Account → Security → App passwords)."
        : "";
    return new EmailDeliveryError(
      `We couldn't send the email.${devHint}`,
      "EMAIL_DELIVERY_FAILED",
    );
  }

  return new EmailDeliveryError(
    "We couldn't send the email right now. Please try again later.",
    "EMAIL_DELIVERY_FAILED",
  );
}
