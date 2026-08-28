import nodemailer from "nodemailer";
import { toEmailDeliveryError } from "@/lib/email/errors";
import type { EmailProvider, SendEmailInput } from "@/lib/email/provider";

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD?.trim(),
  );
}

function smtpFromAddress(): string {
  return (
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "noreply@razorflow.local"
  );
}

function createSmtpTransporter() {
  const port = Number(process.env.SMTP_PORT ?? "587");
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

export class SmtpEmailProvider implements EmailProvider {
  private transporter = createSmtpTransporter();

  async send(input: SendEmailInput): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: smtpFromAddress(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
    } catch (error) {
      throw toEmailDeliveryError(error);
    }
  }
}

/** Verify SMTP credentials without sending mail. For local diagnostics only. */
export async function verifySmtpConnection(): Promise<void> {
  const transporter = createSmtpTransporter();
  try {
    await transporter.verify();
  } catch (error) {
    throw toEmailDeliveryError(error);
  }
}
