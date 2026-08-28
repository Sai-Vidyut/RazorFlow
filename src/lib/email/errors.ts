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
    const gmailHint =
      " Check SMTP_USER and SMTP_PASSWORD on Vercel. For Gmail, use a 16-character App Password.";
    return new EmailDeliveryError(`We couldn't send the email.${gmailHint}`, "EMAIL_DELIVERY_FAILED");
  }

  return new EmailDeliveryError(
    "We couldn't send the email right now. Please try again later.",
    "EMAIL_DELIVERY_FAILED",
  );
}
