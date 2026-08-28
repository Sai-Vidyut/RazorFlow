# RazorFlow

AI merchant commerce agent for the Razorpay Buildathon, AI Growth & Agentic Commerce track.

RazorFlow turns buyer intent into a policy-governed sale on Razorpay. It is not a chatbot.

**Commerce pipeline:** Understand → Identify → Decide → Govern → Transact → Recover

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- PostgreSQL + Prisma
- Motion
- Phosphor icons
- Playwright + Vitest

## Demo merchant: Northline Audio

Northline Audio is the seeded demo storefront: headphones, earbuds, speakers, soundbars, cases, cables, chargers, and accessories. The catalog ships with **40 deterministic products** designed for realistic agent matching (budget tiers, overlapping use cases, attach accessories).

Each SKU has a **unique product image** under `public/products/`: the original four hero products use PNG photography (`halo-anc`, `halo-case`, `drift-buds`, `field-speaker`); the expanded catalog uses deterministic SVG renders keyed by SKU (`public/products/{sku}.svg`). Regenerate expanded SVGs with:

```bash
npm run catalog:images
```

## Surfaces

| Route | Purpose |
| --- | --- |
| `/` | Product story and live metrics (this week) |
| `/desk` | Intent → recommendation → policy → user-controlled cart → Razorpay payment |
| `/policies` | Merchant guardrails (read/write) |
| `/admin` | Merchant control plane: overview, orders, payments, recovery, products, policies, activity, insights, staff |

Legacy API: `GET /api/ledger` (merchant-auth JSON for landing metrics). There is no public `/ledger` page.

## Roles

| Role | Capability |
| --- | --- |
| **Buyer** | Register, verify email, sign in, run desk sessions, checkout on Razorpay |
| **Staff** | Buyer access plus `/admin` for orders, products, policies, recovery, and activity |
| **Administrator** | Staff access plus staff management (bootstrap via `INITIAL_ADMIN_EMAIL`) |

Email verification uses SMTP when configured; otherwise development and test capture mail in a dev outbox (`RAZORFLOW_USE_DEV_EMAIL=1`).

## Local development (PostgreSQL)

RazorFlow is developed and demoed **locally**. Vercel deployment is not part of the current workflow.

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Default database URL:

```
DATABASE_URL=postgresql://razorflow:razorflow@localhost:5432/razorflow
```

Optional Razorpay Test Mode keys:

```
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
```

Without keys, checkout fails gracefully. Payment success requires server-side signature verification.

Webhook endpoint: `POST /api/webhooks/razorpay` (`payment.captured`, `payment.failed`).

### Email verification and admin bootstrap

Add SMTP settings to `.env.local` for production-like verification emails:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-gmail-app-password
SMTP_FROM="Northline Audio <you@gmail.com>"
INITIAL_ADMIN_EMAIL=you@gmail.com
```

If you use Gmail, create an [App Password](https://support.google.com/accounts/answer/185833) and set `SMTP_PASSWORD` to that value. Do not use your normal Gmail password.

When SMTP is not configured, development and test environments capture outbound mail in a dev outbox instead of sending real email.

`INITIAL_ADMIN_EMAIL` designates the first administrator. That account still completes normal 6-digit email verification. After verification, the account receives administrator capability. Staff access is managed separately through Admin → Staff.

### 4. Migrate and seed

```bash
npm run db:migrate
npm run db:seed
```

Seed clears all transactional data (sessions, orders, payments, audit events) and preserves merchant, policy, and the 40-product catalog. Re-running seed does not accumulate transactions or synthetic GMV.

### 5. Run the app

```bash
npm run dev
```

The app listens on `http://localhost:3010`.

## Demo flow

1. Open `/desk`, run the agent on a buyer intent (budget, use case, product count, or sort order).
2. When multiple matches are found, browse options one at a time with **Next product**; add only what you want with **Add to cart** (never auto-added).
3. Review and adjust the cart in the **Transaction** column (quantity, remove), then authorize payment (Razorpay Test Mode or simulate decline).
4. On failure, recovery evaluates policy and catalog before retry.
5. Open `/admin` for orders, payments, recovery queue, products, and audit activity.

Agent recommendations are not cart items until the buyer taps **Add to cart**. The Transaction stage is the single source of truth for the active cart during checkout.

## Hybrid AI discovery

RazorFlow separates **understanding** from **catalog truth**:

- **Gemini** (when configured) extracts structured buyer intent: category, budget, product exclusions, result count, sort order, and soft preferences. It does not receive the product catalog and does not choose SKUs.
- **Deterministic code** resolves named products/exclusions against the Northline catalog, applies hard filters (category, budget, exclusions), ranks eligible products, and returns zero results when nothing qualifies.
- **Policy engine** validates margin, discount, and order caps on the final offer.

Example — `good headphones under 3k except northline commute lite`:

- Commute Lite (₹2,490) is the only headphone under ₹3,000 in the demo catalog.
- Excluding Commute Lite leaves no valid matches, so discovery correctly returns **empty** with an explicit message. It must not return Bassline Over (₹4,290) or ignore the exclusion.

When `GEMINI_API_KEY` is unset or Gemini fails validation, `parse-intent.ts` provides a deterministic fallback with the same hard-constraint pipeline.

## Tests

```bash
npm test
npm run build
npm run test:e2e
```

- **Unit/integration:** Vitest against PostgreSQL (same `DATABASE_URL` as local dev).
- **E2E:** Playwright starts an isolated Next.js dev server on port **3011** with `RAZORFLOW_USE_DEV_EMAIL=1`. Intent extraction uses the deterministic fallback (Gemini is not loaded in the E2E server). Do not rely on a manually started dev server for E2E.
- If Next.js reports a single-dev-server lock, stop any running `npm run dev` on port 3010 before `npm run test:e2e`.
