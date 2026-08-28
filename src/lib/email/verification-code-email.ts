const MERCHANT_NAME = "Northline Audio";

export function buildVerificationCodeEmailHtml(code: string): { subject: string; html: string; text: string } {
  const subject = `Verify your ${MERCHANT_NAME} account`;
  const text = [
    `Your RazorFlow verification code is:`,
    ``,
    code,
    ``,
    `This code expires in 10 minutes.`,
    ``,
    `If you did not create this account, you can ignore this email.`,
  ].join("\n");

  const html = `
    <div style="font-family: system-ui, sans-serif; color: #111; max-width: 480px; line-height: 1.5;">
      <p style="margin: 0 0 12px;">Your RazorFlow verification code is:</p>
      <p style="margin: 0 0 16px; font-size: 28px; font-weight: 600; letter-spacing: 0.2em;">${code}</p>
      <p style="margin: 0 0 8px; color: #555;">This code expires in 10 minutes.</p>
      <p style="margin: 0; color: #555;">If you did not create this account, you can ignore this email.</p>
    </div>
  `.trim();

  return { subject, html, text };
}
