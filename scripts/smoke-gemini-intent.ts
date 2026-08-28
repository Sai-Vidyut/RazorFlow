#!/usr/bin/env tsx
/**
 * Manual Gemini intent smoke test.
 * Run: npm run smoke:gemini-intent
 * Requires GEMINI_API_KEY in .env.local. Never runs checkout or Razorpay.
 */
import dotenv from "dotenv";
import path from "path";
import { extractIntent } from "../src/lib/agent/intent";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

const SAMPLE_REQUEST =
  "I need comfortable wireless headphones for a long international flight, under ₹15,000, preferably with noise cancellation.";

async function main() {
  const result = await extractIntent(SAMPLE_REQUEST);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Smoke test failed");
  process.exit(1);
});
