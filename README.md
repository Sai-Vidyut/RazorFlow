# RazorFlow

AI merchant commerce agent for the Razorpay Buildathon, AI Growth & Agentic Commerce track.

RazorFlow turns buyer intent into a policy-governed sale on Razorpay. It is not a chatbot.

**Commerce pipeline:** Understand → Decide → Govern → Transact → Recover

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- PostgreSQL + Prisma
- Motion
- Phosphor icons
- Playwright + Vitest

## Screens

| Route | Purpose |
| --- | --- |
| `/` | Product story and live metrics (this week) |
| `/desk` | Intent → recommendation → policy → Razorpay payment |
| `/policies` | Merchant guardrails (read/write) |
| `/admin` | Merchant control plane: overview, orders, payments, recovery, products, policies, activity, insights |

Legacy API: `GET /api/ledger` (merchant-auth JSON for landing metrics). There is no public `/ledger` page.

## Setup

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

### Email verification and admin bootstrap (Phase 12)

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

Seed clears all transactional data (sessions, orders, payments, audit events) and preserves merchant, policy, and catalog. Re-running seed does not accumulate transactions.

### 5. Run the app

```bash
npm run dev
```

The app listens on `http://localhost:3010`.

## Demo flow

1. Open `/desk`, run the agent on a buyer intent.
2. Authorize payment (Razorpay Test Mode or simulate decline).
3. On failure, recovery evaluates policy and catalog before retry.
4. Open `/admin` for orders, payments, recovery queue, and audit activity.

## Tests

```bash
npm test
npm run build
npm run test:e2e
```

E2E uses port 3010. Restart the dev server after schema changes if `reuseExistingServer` serves stale code.
