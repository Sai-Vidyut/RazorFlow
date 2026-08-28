export type DevEmailMessage = {
  to: string;
  subject: string;
  html: string;
  sentAt: Date;
};

const outbox: DevEmailMessage[] = [];

export function recordDevEmail(message: Omit<DevEmailMessage, "sentAt">): void {
  outbox.push({ ...message, sentAt: new Date() });
}

export function getDevOutbox(): readonly DevEmailMessage[] {
  return outbox;
}

export function clearDevOutbox(): void {
  outbox.length = 0;
}

export function findLatestDevEmailTo(to: string): DevEmailMessage | undefined {
  for (let i = outbox.length - 1; i >= 0; i -= 1) {
    if (outbox[i].to === to) return outbox[i];
  }
  return undefined;
}

export function extractUrlFromEmail(html: string, pathPrefix: string): string | null {
  const match = html.match(new RegExp(`(https?://[^\\s"']+${pathPrefix}[^\\s"']*)`));
  return match?.[1] ?? null;
}

export function extractTokenFromUrl(url: string, param = "token"): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get(param);
  } catch {
    return null;
  }
}

/** Extract 6-digit verification code from branded verification email (dev/test only). */
export function extractVerificationCodeFromEmail(html: string): string | null {
  const match = html.match(/letter-spacing:\s*0\.2em;">(\d{6})</);
  if (match?.[1]) return match[1];
  const textMatch = html.match(/\b(\d{6})\b/);
  return textMatch?.[1] ?? null;
}
