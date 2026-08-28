import { setIntentProviderForTests } from "@/lib/agent/intent";

process.env.RAZORFLOW_SESSION_SECRET ??= "razorflow-test-session-secret";
process.env.INITIAL_ADMIN_EMAIL ??= "admin@example.com";

// Keep unit/integration tests deterministic unless a test opts into Gemini explicitly.
delete process.env.GEMINI_API_KEY;
setIntentProviderForTests(null);
