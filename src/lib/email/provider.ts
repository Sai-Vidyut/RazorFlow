import { recordDevEmail } from "@/lib/email/dev-outbox";
import { buildVerificationCodeEmailHtml } from "@/lib/email/verification-code-email";
import { isSmtpConfigured, SmtpEmailProvider } from "@/lib/email/smtp";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type EmailProvider = {
  send(input: SendEmailInput): Promise<void>;
};

function getAppBaseUrl(): string {
  return (
    process.env.RAZORFLOW_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3010"
  );
}

export function buildPasswordResetEmailLink(token: string): string {
  return `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

class DevEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<void> {
    recordDevEmail(input);
    if (process.env.NODE_ENV !== "test") {
      console.info(`[dev-email] To: ${input.to} | Subject: ${input.subject}`);
    }
  }
}

class ConsoleEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<void> {
    console.info(`[email] To: ${input.to} | Subject: ${input.subject}`);
  }
}

export function getEmailProvider(): EmailProvider {
  if (process.env.RAZORFLOW_USE_DEV_EMAIL === "1") {
    return new DevEmailProvider();
  }
  if (isSmtpConfigured()) {
    return new SmtpEmailProvider();
  }
  if (process.env.NODE_ENV === "production") {
    return new ConsoleEmailProvider();
  }
  return new DevEmailProvider();
}

export async function sendVerificationCodeEmail(to: string, code: string): Promise<void> {
  const { subject, html, text } = buildVerificationCodeEmailHtml(code);
  await getEmailProvider().send({ to, subject, html, text });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = buildPasswordResetEmailLink(token);
  await getEmailProvider().send({
    to,
    subject: "Reset your RazorFlow password",
    html: `<p>Reset your RazorFlow password using the link below. This link expires soon and can only be used once.</p><p><a href="${link}">Reset password</a></p>`,
    text: `Reset your RazorFlow password: ${link}`,
  });
}
