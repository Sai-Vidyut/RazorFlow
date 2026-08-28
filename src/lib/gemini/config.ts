export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_REQUEST_TIMEOUT_MS = 15_000;

export function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || null;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}
